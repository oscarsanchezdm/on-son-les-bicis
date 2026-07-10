import "leaflet";

declare module "leaflet" {
  interface MapOptions {
    rotate?: boolean;
    bearing?: number;
    rotateControl?: boolean;
  }

  interface Map {
    setBearing(bearing: number): this;
    getBearing(): number;
  }
}
