// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { queryRef, executeQuery, validateArgsWithOptions, mutationRef, executeMutation, validateArgs, makeMemoryCacheProvider } from 'firebase/data-connect';

export const connectorConfig = {
  connector: 'example',
  service: 'realvirtual-web',
  location: 'europe-west1'
};
export const dataConnectSettings = {
  cacheSettings: {
    cacheProvider: makeMemoryCacheProvider()
  }
};
export const listAllDigitalTwinModelsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListAllDigitalTwinModels');
}
listAllDigitalTwinModelsRef.operationName = 'ListAllDigitalTwinModels';

export function listAllDigitalTwinModels(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(listAllDigitalTwinModelsRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}

export const getRobotByIdRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetRobotById', inputVars);
}
getRobotByIdRef.operationName = 'GetRobotById';

export function getRobotById(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(getRobotByIdRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}

export const createNewSimulationRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateNewSimulation', inputVars);
}
createNewSimulationRef.operationName = 'CreateNewSimulation';

export function createNewSimulation(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(createNewSimulationRef(dcInstance, inputVars));
}

export const getUserSimulationsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetUserSimulations');
}
getUserSimulationsRef.operationName = 'GetUserSimulations';

export function getUserSimulations(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(getUserSimulationsRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}

export const listRobotHistoricalEventsRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListRobotHistoricalEvents', inputVars);
}
listRobotHistoricalEventsRef.operationName = 'ListRobotHistoricalEvents';

export function listRobotHistoricalEvents(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(listRobotHistoricalEventsRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}

