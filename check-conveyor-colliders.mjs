import fs from 'fs';

const buf = fs.readFileSync('public/models/demo.glb');
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));

const nodes = json.nodes;

// Check the collider/BoxCollider data for TransportSurface nodes
const tsNodes = [83, 97, 111, 125];

for (const idx of tsNodes) {
  console.log(`\n=== Node[${idx}] "${nodes[idx].name}" ===`);
  const rv = nodes[idx].extras?.realvirtual;
  if (rv) {
    // Show all top-level keys
    console.log('  Keys:', Object.keys(rv));

    // Check for BoxCollider
    if (rv.BoxCollider) {
      console.log('  BoxCollider:', JSON.stringify(rv.BoxCollider));
    } else {
      console.log('  BoxCollider: NOT FOUND');
    }

    // Check for colliders
    if (rv.colliders) {
      console.log('  colliders:', JSON.stringify(rv.colliders));
    }
  }
}

// Also check source node (176 = Turbine)
console.log('\n=== Source Node[176] "Turbine" ===');
const rv176 = nodes[176].extras?.realvirtual;
if (rv176) {
  console.log('  Keys:', Object.keys(rv176));
  if (rv176.BoxCollider) {
    console.log('  BoxCollider:', JSON.stringify(rv176.BoxCollider));
  }
  if (rv176.colliders) {
    console.log('  colliders:', JSON.stringify(rv176.colliders));
  }
}
