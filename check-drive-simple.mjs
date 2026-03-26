import fs from 'fs';

const buf = fs.readFileSync('public/models/demo.glb');
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));

const nodes = json.nodes;

// Check Drive_Simple extras for conveyor nodes
const conveyorNodes = [79, 93, 107, 121];

for (const idx of conveyorNodes) {
  const node = nodes[idx];
  console.log(`\n=== Node[${idx}] "${node.name}" ===`);
  const rv = node.extras?.realvirtual;
  if (rv) {
    if (rv.Drive_Simple) {
      console.log('  Drive_Simple:', JSON.stringify(rv.Drive_Simple, null, 2));
    } else {
      console.log('  Drive_Simple: NOT FOUND');
    }
    if (rv.Drive) {
      // Just TargetSpeed
      console.log(`  Drive.TargetSpeed: ${rv.Drive.TargetSpeed}`);
      console.log(`  Drive.Direction: ${rv.Drive.Direction}`);
      console.log(`  Drive.ReverseDirection: ${rv.Drive.ReverseDirection}`);
    }
  }
}

// Also check what signals exist for the Forward/Backward references
console.log('\n=== All PLCOutputBool signals ===');
nodes.forEach((node, idx) => {
  const rv = node.extras?.realvirtual;
  if (rv && rv.PLCOutputBool) {
    const status = rv.PLCOutputBool.Status;
    console.log(`Node[${idx}] "${node.name}" → PLCOutputBool (Value=${status?.Value})`);
  }
});
