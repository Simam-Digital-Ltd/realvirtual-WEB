// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, ExecuteQueryOptions, MutationRef, MutationPromise, DataConnectSettings } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;
export const dataConnectSettings: DataConnectSettings;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface CreateNewSimulationData {
  simulation_insert: Simulation_Key;
}

export interface CreateNewSimulationVariables {
  id: UUIDString;
  name: string;
  simulationData: string;
  status: string;
  robotId: UUIDString;
  userId: UUIDString;
}

export interface DigitalTwinModel_Key {
  id: UUIDString;
  __typename?: 'DigitalTwinModel_Key';
}

export interface GetRobotByIdData {
  robot?: {
    id: UUIDString;
    name: string;
    model: string;
    serialNumber: string;
    location: string;
    manufacturer?: string | null;
    installationDate?: DateString | null;
    lastMaintenanceDate?: DateString | null;
    createdAt: TimestampString;
  } & Robot_Key;
}

export interface GetRobotByIdVariables {
  robotId: UUIDString;
}

export interface GetUserSimulationsData {
  users: ({
    id: UUIDString;
    displayName: string;
    simulations_on_user: ({
      id: UUIDString;
      name: string;
      status: string;
      createdAt: TimestampString;
      robot?: {
        id: UUIDString;
        name: string;
      } & Robot_Key;
    } & Simulation_Key)[];
  } & User_Key)[];
}

export interface ListAllDigitalTwinModelsData {
  digitalTwinModels: ({
    id: UUIDString;
    name: string;
    version: string;
    modelDataUrl: string;
    description?: string | null;
    associatedRobotType?: string | null;
    createdAt: TimestampString;
  } & DigitalTwinModel_Key)[];
}

export interface ListRobotHistoricalEventsData {
  robotEvents: ({
    id: UUIDString;
    robot?: {
      id: UUIDString;
      name: string;
    } & Robot_Key;
      timestamp: TimestampString;
      data: string;
  } & RobotEvent_Key)[];
}

export interface ListRobotHistoricalEventsVariables {
  startTime: TimestampString;
}

export interface RobotEvent_Key {
  id: UUIDString;
  __typename?: 'RobotEvent_Key';
}

export interface Robot_Key {
  id: UUIDString;
  __typename?: 'Robot_Key';
}

export interface Simulation_Key {
  id: UUIDString;
  __typename?: 'Simulation_Key';
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

interface ListAllDigitalTwinModelsRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListAllDigitalTwinModelsData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<ListAllDigitalTwinModelsData, undefined>;
  operationName: string;
}
export const listAllDigitalTwinModelsRef: ListAllDigitalTwinModelsRef;

export function listAllDigitalTwinModels(options?: ExecuteQueryOptions): QueryPromise<ListAllDigitalTwinModelsData, undefined>;
export function listAllDigitalTwinModels(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListAllDigitalTwinModelsData, undefined>;

interface GetRobotByIdRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetRobotByIdVariables): QueryRef<GetRobotByIdData, GetRobotByIdVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetRobotByIdVariables): QueryRef<GetRobotByIdData, GetRobotByIdVariables>;
  operationName: string;
}
export const getRobotByIdRef: GetRobotByIdRef;

export function getRobotById(vars: GetRobotByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetRobotByIdData, GetRobotByIdVariables>;
export function getRobotById(dc: DataConnect, vars: GetRobotByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetRobotByIdData, GetRobotByIdVariables>;

interface CreateNewSimulationRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateNewSimulationVariables): MutationRef<CreateNewSimulationData, CreateNewSimulationVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateNewSimulationVariables): MutationRef<CreateNewSimulationData, CreateNewSimulationVariables>;
  operationName: string;
}
export const createNewSimulationRef: CreateNewSimulationRef;

export function createNewSimulation(vars: CreateNewSimulationVariables): MutationPromise<CreateNewSimulationData, CreateNewSimulationVariables>;
export function createNewSimulation(dc: DataConnect, vars: CreateNewSimulationVariables): MutationPromise<CreateNewSimulationData, CreateNewSimulationVariables>;

interface GetUserSimulationsRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetUserSimulationsData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<GetUserSimulationsData, undefined>;
  operationName: string;
}
export const getUserSimulationsRef: GetUserSimulationsRef;

export function getUserSimulations(options?: ExecuteQueryOptions): QueryPromise<GetUserSimulationsData, undefined>;
export function getUserSimulations(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetUserSimulationsData, undefined>;

interface ListRobotHistoricalEventsRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: ListRobotHistoricalEventsVariables): QueryRef<ListRobotHistoricalEventsData, ListRobotHistoricalEventsVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: ListRobotHistoricalEventsVariables): QueryRef<ListRobotHistoricalEventsData, ListRobotHistoricalEventsVariables>;
  operationName: string;
}
export const listRobotHistoricalEventsRef: ListRobotHistoricalEventsRef;

export function listRobotHistoricalEvents(vars: ListRobotHistoricalEventsVariables, options?: ExecuteQueryOptions): QueryPromise<ListRobotHistoricalEventsData, ListRobotHistoricalEventsVariables>;
export function listRobotHistoricalEvents(dc: DataConnect, vars: ListRobotHistoricalEventsVariables, options?: ExecuteQueryOptions): QueryPromise<ListRobotHistoricalEventsData, ListRobotHistoricalEventsVariables>;

