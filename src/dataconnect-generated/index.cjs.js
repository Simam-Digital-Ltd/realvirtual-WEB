// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

const { queryRef, executeQuery, validateArgsWithOptions, mutationRef, executeMutation, validateArgs, makeMemoryCacheProvider } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'example',
  service: 'realvirtual-web',
  location: 'europe-west1'
};
exports.connectorConfig = connectorConfig;
const dataConnectSettings = {
  cacheSettings: {
    cacheProvider: makeMemoryCacheProvider()
  }
};
exports.dataConnectSettings = dataConnectSettings;

const listAllDigitalTwinModelsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListAllDigitalTwinModels');
}
listAllDigitalTwinModelsRef.operationName = 'ListAllDigitalTwinModels';
exports.listAllDigitalTwinModelsRef = listAllDigitalTwinModelsRef;

exports.listAllDigitalTwinModels = function listAllDigitalTwinModels(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(listAllDigitalTwinModelsRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}
;

const getRobotByIdRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetRobotById', inputVars);
}
getRobotByIdRef.operationName = 'GetRobotById';
exports.getRobotByIdRef = getRobotByIdRef;

exports.getRobotById = function getRobotById(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(getRobotByIdRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}
;

const createNewSimulationRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateNewSimulation', inputVars);
}
createNewSimulationRef.operationName = 'CreateNewSimulation';
exports.createNewSimulationRef = createNewSimulationRef;

exports.createNewSimulation = function createNewSimulation(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(createNewSimulationRef(dcInstance, inputVars));
}
;

const getUserSimulationsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetUserSimulations');
}
getUserSimulationsRef.operationName = 'GetUserSimulations';
exports.getUserSimulationsRef = getUserSimulationsRef;

exports.getUserSimulations = function getUserSimulations(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(getUserSimulationsRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}
;

const listRobotHistoricalEventsRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListRobotHistoricalEvents', inputVars);
}
listRobotHistoricalEventsRef.operationName = 'ListRobotHistoricalEvents';
exports.listRobotHistoricalEventsRef = listRobotHistoricalEventsRef;

exports.listRobotHistoricalEvents = function listRobotHistoricalEvents(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(listRobotHistoricalEventsRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}
;
