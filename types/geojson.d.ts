declare namespace GeoJSON {
  interface Geometry {
    type: string;
    coordinates: number[][] | number[][][] | number[][][][];
  }

  interface Feature {
    type: "Feature";
    geometry: Geometry;
    properties?: any;
  }

  interface FeatureCollection {
    type: "FeatureCollection";
    features: Feature[];
  }
}
