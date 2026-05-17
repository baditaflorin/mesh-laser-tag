import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-laser-tag",
  description: "Phone-as-laser. Compass+tilt aim, GPS positions, hold-lock 2s = tagged out.",
  accentHex: "#ff3838",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
