// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>


import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getDataConnect } from "firebase/data-connect";
import { connectorConfig } from "../dataconnect-generated";

// Firebase configuration provided by the user
const firebaseConfig = {
  apiKey: "AIzaSyCZE-ls9PCIHF1j9QGZ9Qu_S_UnI8fXW_c",
  authDomain: "sim-digitaltwin-realvirtual.firebaseapp.com",
  projectId: "sim-digitaltwin-realvirtual",
  storageBucket: "sim-digitaltwin-realvirtual.firebasestorage.app",
  messagingSenderId: "569741504967",
  appId: "1:569741504967:web:2d618adac8f159b2db29e2",
  measurementId: "G-JSPYJG9QX6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const analytics = getAnalytics(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Data Connect
export const dataConnect = getDataConnect(app, connectorConfig);

export default app;
