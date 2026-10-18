/** Metadata of a picked building, read from the tileset's EXT_structural_metadata table. */
export type BuildingInfo = {
  /** Catastro building code (ConCodigo). */
  id: string;
  featureId?: number;
  floors?: number;
  /** Metres, LiDAR. */
  height?: number;
  roofForm?: string;
};
