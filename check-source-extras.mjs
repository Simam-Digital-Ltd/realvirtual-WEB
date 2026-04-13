// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import fs from 'fs';

const buf = fs.readFileSync('public/models/demo.glb');
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));

const nodes = json.nodes;

// Find all nodes with Source component
console.log('=== All Source nodes ===');
nodes.forEach((node, idx) => {
  const rv = node.extras?.realvirtual;
  if (rv && rv.Source) {
    console.log(`\nNode[${idx}] "${node.name}":`);
    console.log('  Source extras:', JSON.stringify(rv.Source, null, 2));
    if (rv.MU) {
      console.log('  MU extras:', JSON.stringify(rv.MU, null, 2));
    }
  }
});

// Also check all TransportSurface nodes for reference
console.log('\n=== All TransportSurface nodes ===');
nodes.forEach((node, idx) => {
  const rv = node.extras?.realvirtual;
  if (rv && rv.TransportSurface) {
    console.log(`\nNode[${idx}] "${node.name}":`);
    console.log('  TransportSurface extras:', JSON.stringify(rv.TransportSurface, null, 2));
  }
});

// Check all Sink nodes
console.log('\n=== All Sink nodes ===');
nodes.forEach((node, idx) => {
  const rv = node.extras?.realvirtual;
  if (rv && rv.Sink) {
    console.log(`\nNode[${idx}] "${node.name}":`);
    console.log('  Sink extras:', JSON.stringify(rv.Sink, null, 2));
  }
});
