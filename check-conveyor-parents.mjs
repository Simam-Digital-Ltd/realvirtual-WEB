import fs from 'fs';

const buf = fs.readFileSync('public/models/demo.glb');
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));

const nodes = json.nodes;

// Build parent map
const parentOf = new Map();
nodes.forEach((node, idx) => {
  if (node.children) {
    for (const childIdx of node.children) {
      parentOf.set(childIdx, idx);
    }
  }
});

// For each TransportSurface Conveyor node, walk up the hierarchy to find Drive
const tsNodes = [83, 97, 111, 125];

for (const idx of tsNodes) {
  console.log(`\n=== TransportSurface Node[${idx}] "${nodes[idx].name}" ===`);

  // Walk up parents
  let current = idx;
  let depth = 0;
  while (current !== undefined && depth < 10) {
    const node = nodes[current];
    const rv = node.extras?.realvirtual;
    const comps = rv ? Object.keys(rv) : [];
    const hasDrive = comps.includes('Drive') || comps.includes('Drive_Simple') || comps.includes('Drive_Cylinder');
    console.log(`  ${'  '.repeat(depth)}Node[${current}] "${node.name}" comps=[${comps.join(', ')}]${hasDrive ? ' *** HAS DRIVE ***' : ''}`);
    if (hasDrive && rv) {
      const driveData = rv.Drive || rv.Drive_Simple || rv.Drive_Cylinder;
      console.log(`    Drive extras: ${JSON.stringify(driveData, null, 2).substring(0, 500)}`);
    }
    current = parentOf.get(current);
    depth++;
  }
}

// Also check: which nodes have Drive components?
console.log('\n=== All nodes with Drive/Drive_Simple/Drive_Cylinder ===');
nodes.forEach((node, idx) => {
  const rv = node.extras?.realvirtual;
  if (rv && (rv.Drive || rv.Drive_Simple || rv.Drive_Cylinder)) {
    const driveType = rv.Drive ? 'Drive' : (rv.Drive_Simple ? 'Drive_Simple' : 'Drive_Cylinder');
    console.log(`Node[${idx}] "${node.name}" → ${driveType}`);
  }
});
