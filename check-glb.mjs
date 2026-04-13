// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import fs from 'fs';

const buf = fs.readFileSync('public/models/demo.glb');
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));

const nodes = json.nodes;
const meshes = json.meshes;
const materials = json.materials || [];
const textures = json.textures || [];
const images = json.images || [];

console.log(`Total: ${nodes.length} nodes, ${meshes.length} meshes, ${materials.length} materials, ${textures.length} textures, ${images.length} images\n`);

function nodeInfo(idx) {
  const node = nodes[idx];
  if (!node) return `Node[${idx}] NOT FOUND`;
  const hasMesh = node.mesh !== undefined;
  let meshInfo = '';
  if (hasMesh) {
    const mesh = meshes[node.mesh];
    meshInfo = ` mesh="${mesh.name}" prims=${mesh.primitives.length}`;
    mesh.primitives.forEach((prim, pi) => {
      if (prim.material !== undefined) {
        const mat = materials[prim.material];
        const pbr = mat?.pbrMetallicRoughness;
        const hasBaseColorTex = pbr && pbr.baseColorTexture !== undefined;
        const hasNormalTex = mat?.normalTexture !== undefined;
        meshInfo += ` [prim${pi}: mat="${mat?.name || 'unnamed'}" baseColorTex=${!!hasBaseColorTex} normalTex=${!!hasNormalTex}]`;
        if (hasBaseColorTex) {
          const texIdx = pbr.baseColorTexture.index;
          const tex = textures[texIdx];
          const imgIdx = tex?.source;
          const img = images[imgIdx];
          meshInfo += ` (tex=${texIdx} img=${imgIdx} uri="${img?.uri || img?.mimeType || 'embedded'}")`;
        }
      }
    });
  }
  const extras = node.extras?.realvirtual;
  const comps = [];
  if (extras) {
    for (const key of Object.keys(extras)) comps.push(key);
  }
  const compStr = comps.length > 0 ? ` [${comps.join(', ')}]` : '';
  return `Node[${idx}] "${node.name}"${hasMesh ? meshInfo : ' NO_MESH'}${compStr} children=${JSON.stringify(node.children || [])}`;
}

// Show full subtree of ConveyorEntry1 (node 79)
console.log('=== ConveyorEntry1 subtree ===');
function printTree(idx, depth = 0) {
  const prefix = '  '.repeat(depth);
  console.log(prefix + nodeInfo(idx));
  const children = nodes[idx]?.children || [];
  for (const childIdx of children) {
    printTree(childIdx, depth + 1);
  }
}
printTree(79);

console.log('\n=== ConveyorEntry2 subtree ===');
printTree(93);

// Check Turbine (Source) subtree for instancing eligibility
console.log('\n=== Turbine (Source node 176) subtree ===');
printTree(176);

// Check MU nodes
console.log('\n=== All MU-marked nodes ===');
nodes.forEach((node, idx) => {
  const rv = node.extras?.realvirtual;
  if (rv && rv.MU) {
    console.log(nodeInfo(idx));
  }
});
