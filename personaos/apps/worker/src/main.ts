import { serviceManifest } from "@personaos/shared";

const worker = {
  name: "personaos-worker",
  status: "idle",
  serviceManifest
};

console.log(JSON.stringify(worker));
