"""Upload a GeoTIFF DTM to Cesium ion as a terrain asset merged onto Cesium World Terrain.

  CESIUM_ION_TOKEN=... .venv/bin/python src/ion_upload.py data/chapinero-dtm.tif --name "Bogotá Chapinero DTM (IDECA)"

Prints the asset id once ion has finished tiling. Heights in the GeoTIFF are orthometric (MSL);
ion converts them to ellipsoidal heights with EGM96.
"""
import argparse, json, os, sys, time, urllib.request
import boto3

API = "https://api.cesium.com/v1/assets"

def req(method, url, token, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=120) as resp:
        txt = resp.read().decode()
        return json.loads(txt) if txt else {}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("tif")
    ap.add_argument("--name", required=True)
    ap.add_argument("--description", default="Catastro Bogotá / IDECA urban DTM sampled at 8 m, merged onto Cesium World Terrain.")
    a = ap.parse_args()
    token = os.environ.get("CESIUM_ION_TOKEN") or os.environ.get("NEXT_PUBLIC_CESIUM_ION_TOKEN")
    if not token:
        sys.exit("CESIUM_ION_TOKEN not set")

    created = req("POST", API, token, {
        "name": a.name, "description": a.description, "type": "TERRAIN",
        "options": {"sourceType": "RASTER_TERRAIN", "heightReference": "MEAN_SEA_LEVEL", "baseTerrainId": 1},
    })
    asset_id = created["assetMetadata"]["id"]
    up = created["uploadLocation"]
    print("asset", asset_id, "uploading…", flush=True)
    s3 = boto3.client("s3", aws_access_key_id=up["accessKey"], aws_secret_access_key=up["secretAccessKey"],
                      aws_session_token=up["sessionToken"], endpoint_url=up["endpoint"], region_name="us-east-1")
    s3.upload_file(a.tif, up["bucket"], up["prefix"] + os.path.basename(a.tif))
    oc = created["onComplete"]
    req(oc["method"], oc["url"], token, oc["fields"])
    print("tiling…", flush=True)
    while True:
        meta = req("GET", f"{API}/{asset_id}", token)
        st = meta["status"]
        if st == "COMPLETE":
            print("done, asset id", asset_id)
            return
        if st in ("ERROR", "DATA_ERROR"):
            sys.exit(f"ion failed: {json.dumps(meta)[:500]}")
        print(f"  {st} {meta.get('percentComplete', 0)}%", flush=True)
        time.sleep(10)

if __name__ == "__main__":
    main()
