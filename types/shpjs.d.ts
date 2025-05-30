declare module 'shpjs' {
  function shp(base64Content: string): Promise<GeoJSON.FeatureCollection>;
  export = shp;
}
