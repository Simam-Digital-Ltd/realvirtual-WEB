const fs = require("fs");
const buf = fs.readFileSync("public/models/demo.glb");
const cl = buf.readUInt32LE(12);
const j = buf.slice(20, 20 + cl).toString("utf8");
const g = JSON.parse(j);

for (const n of g.nodes || []) {
  const rv = n.extras && n.extras.realvirtual;
  if (rv == null) continue;
  if (rv.TransportSurface) {
    console.log("TransportSurface:", n.name);
    console.log("  colliders:", JSON.stringify(rv.colliders));
    console.log("  BoxCollider:", JSON.stringify(rv.BoxCollider));
    break;
  }
}
for (const n of g.nodes || []) {
  const rv = n.extras && n.extras.realvirtual;
  if (rv == null) continue;
  if (rv.Sensor) {
    console.log("Sensor:", n.name);
    console.log("  colliders:", JSON.stringify(rv.colliders));
    console.log("  BoxCollider:", JSON.stringify(rv.BoxCollider));
    break;
  }
}

// Count how many nodes use colliders array vs BoxCollider key
let collidersArr = 0, boxKey = 0;
for (const n of g.nodes || []) {
  const rv = n.extras && n.extras.realvirtual;
  if (rv == null) continue;
  if (rv.colliders) collidersArr++;
  if (rv.BoxCollider) boxKey++;
}
console.log("\nNodes with colliders array:", collidersArr);
console.log("Nodes with BoxCollider key:", boxKey);
