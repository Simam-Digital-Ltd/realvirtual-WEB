// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { ListAllDigitalTwinModelsData, GetRobotByIdData, GetRobotByIdVariables, CreateNewSimulationData, CreateNewSimulationVariables, GetUserSimulationsData, ListRobotHistoricalEventsData, ListRobotHistoricalEventsVariables } from '../';
import { UseDataConnectQueryResult, useDataConnectQueryOptions, UseDataConnectMutationResult, useDataConnectMutationOptions} from '@tanstack-query-firebase/react/data-connect';
import { UseQueryResult, UseMutationResult} from '@tanstack/react-query';
import { DataConnect } from 'firebase/data-connect';
import { FirebaseError } from 'firebase/app';


export function useListAllDigitalTwinModels(options?: useDataConnectQueryOptions<ListAllDigitalTwinModelsData>): UseDataConnectQueryResult<ListAllDigitalTwinModelsData, undefined>;
export function useListAllDigitalTwinModels(dc: DataConnect, options?: useDataConnectQueryOptions<ListAllDigitalTwinModelsData>): UseDataConnectQueryResult<ListAllDigitalTwinModelsData, undefined>;

export function useGetRobotById(vars: GetRobotByIdVariables, options?: useDataConnectQueryOptions<GetRobotByIdData>): UseDataConnectQueryResult<GetRobotByIdData, GetRobotByIdVariables>;
export function useGetRobotById(dc: DataConnect, vars: GetRobotByIdVariables, options?: useDataConnectQueryOptions<GetRobotByIdData>): UseDataConnectQueryResult<GetRobotByIdData, GetRobotByIdVariables>;

export function useCreateNewSimulation(options?: useDataConnectMutationOptions<CreateNewSimulationData, FirebaseError, CreateNewSimulationVariables>): UseDataConnectMutationResult<CreateNewSimulationData, CreateNewSimulationVariables>;
export function useCreateNewSimulation(dc: DataConnect, options?: useDataConnectMutationOptions<CreateNewSimulationData, FirebaseError, CreateNewSimulationVariables>): UseDataConnectMutationResult<CreateNewSimulationData, CreateNewSimulationVariables>;

export function useGetUserSimulations(options?: useDataConnectQueryOptions<GetUserSimulationsData>): UseDataConnectQueryResult<GetUserSimulationsData, undefined>;
export function useGetUserSimulations(dc: DataConnect, options?: useDataConnectQueryOptions<GetUserSimulationsData>): UseDataConnectQueryResult<GetUserSimulationsData, undefined>;

export function useListRobotHistoricalEvents(vars: ListRobotHistoricalEventsVariables, options?: useDataConnectQueryOptions<ListRobotHistoricalEventsData>): UseDataConnectQueryResult<ListRobotHistoricalEventsData, ListRobotHistoricalEventsVariables>;
export function useListRobotHistoricalEvents(dc: DataConnect, vars: ListRobotHistoricalEventsVariables, options?: useDataConnectQueryOptions<ListRobotHistoricalEventsData>): UseDataConnectQueryResult<ListRobotHistoricalEventsData, ListRobotHistoricalEventsVariables>;
