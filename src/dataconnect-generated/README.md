# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `example`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

**If you're looking for the `React README`, you can find it at [`dataconnect-generated/react/README.md`](./react/README.md)**

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*ListAllDigitalTwinModels*](#listalldigitaltwinmodels)
  - [*GetRobotById*](#getrobotbyid)
  - [*GetUserSimulations*](#getusersimulations)
  - [*ListRobotHistoricalEvents*](#listrobothistoricalevents)
- [**Mutations**](#mutations)
  - [*CreateNewSimulation*](#createnewsimulation)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `example`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@dataconnect/generated` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## ListAllDigitalTwinModels
You can execute the `ListAllDigitalTwinModels` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
listAllDigitalTwinModels(options?: ExecuteQueryOptions): QueryPromise<ListAllDigitalTwinModelsData, undefined>;

interface ListAllDigitalTwinModelsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListAllDigitalTwinModelsData, undefined>;
}
export const listAllDigitalTwinModelsRef: ListAllDigitalTwinModelsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
listAllDigitalTwinModels(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListAllDigitalTwinModelsData, undefined>;

interface ListAllDigitalTwinModelsRef {
  ...
  (dc: DataConnect): QueryRef<ListAllDigitalTwinModelsData, undefined>;
}
export const listAllDigitalTwinModelsRef: ListAllDigitalTwinModelsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the listAllDigitalTwinModelsRef:
```typescript
const name = listAllDigitalTwinModelsRef.operationName;
console.log(name);
```

### Variables
The `ListAllDigitalTwinModels` query has no variables.
### Return Type
Recall that executing the `ListAllDigitalTwinModels` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ListAllDigitalTwinModelsData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `ListAllDigitalTwinModels`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, listAllDigitalTwinModels } from '@dataconnect/generated';


// Call the `listAllDigitalTwinModels()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await listAllDigitalTwinModels();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await listAllDigitalTwinModels(dataConnect);

console.log(data.digitalTwinModels);

// Or, you can use the `Promise` API.
listAllDigitalTwinModels().then((response) => {
  const data = response.data;
  console.log(data.digitalTwinModels);
});
```

### Using `ListAllDigitalTwinModels`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, listAllDigitalTwinModelsRef } from '@dataconnect/generated';


// Call the `listAllDigitalTwinModelsRef()` function to get a reference to the query.
const ref = listAllDigitalTwinModelsRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = listAllDigitalTwinModelsRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.digitalTwinModels);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.digitalTwinModels);
});
```

## GetRobotById
You can execute the `GetRobotById` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getRobotById(vars: GetRobotByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetRobotByIdData, GetRobotByIdVariables>;

interface GetRobotByIdRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetRobotByIdVariables): QueryRef<GetRobotByIdData, GetRobotByIdVariables>;
}
export const getRobotByIdRef: GetRobotByIdRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getRobotById(dc: DataConnect, vars: GetRobotByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetRobotByIdData, GetRobotByIdVariables>;

interface GetRobotByIdRef {
  ...
  (dc: DataConnect, vars: GetRobotByIdVariables): QueryRef<GetRobotByIdData, GetRobotByIdVariables>;
}
export const getRobotByIdRef: GetRobotByIdRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getRobotByIdRef:
```typescript
const name = getRobotByIdRef.operationName;
console.log(name);
```

### Variables
The `GetRobotById` query requires an argument of type `GetRobotByIdVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface GetRobotByIdVariables {
  robotId: UUIDString;
}
```
### Return Type
Recall that executing the `GetRobotById` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetRobotByIdData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `GetRobotById`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getRobotById, GetRobotByIdVariables } from '@dataconnect/generated';

// The `GetRobotById` query requires an argument of type `GetRobotByIdVariables`:
const getRobotByIdVars: GetRobotByIdVariables = {
  robotId: ..., 
};

// Call the `getRobotById()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getRobotById(getRobotByIdVars);
// Variables can be defined inline as well.
const { data } = await getRobotById({ robotId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getRobotById(dataConnect, getRobotByIdVars);

console.log(data.robot);

// Or, you can use the `Promise` API.
getRobotById(getRobotByIdVars).then((response) => {
  const data = response.data;
  console.log(data.robot);
});
```

### Using `GetRobotById`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getRobotByIdRef, GetRobotByIdVariables } from '@dataconnect/generated';

// The `GetRobotById` query requires an argument of type `GetRobotByIdVariables`:
const getRobotByIdVars: GetRobotByIdVariables = {
  robotId: ..., 
};

// Call the `getRobotByIdRef()` function to get a reference to the query.
const ref = getRobotByIdRef(getRobotByIdVars);
// Variables can be defined inline as well.
const ref = getRobotByIdRef({ robotId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getRobotByIdRef(dataConnect, getRobotByIdVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.robot);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.robot);
});
```

## GetUserSimulations
You can execute the `GetUserSimulations` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getUserSimulations(options?: ExecuteQueryOptions): QueryPromise<GetUserSimulationsData, undefined>;

interface GetUserSimulationsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetUserSimulationsData, undefined>;
}
export const getUserSimulationsRef: GetUserSimulationsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getUserSimulations(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetUserSimulationsData, undefined>;

interface GetUserSimulationsRef {
  ...
  (dc: DataConnect): QueryRef<GetUserSimulationsData, undefined>;
}
export const getUserSimulationsRef: GetUserSimulationsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getUserSimulationsRef:
```typescript
const name = getUserSimulationsRef.operationName;
console.log(name);
```

### Variables
The `GetUserSimulations` query has no variables.
### Return Type
Recall that executing the `GetUserSimulations` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetUserSimulationsData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `GetUserSimulations`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getUserSimulations } from '@dataconnect/generated';


// Call the `getUserSimulations()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getUserSimulations();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getUserSimulations(dataConnect);

console.log(data.users);

// Or, you can use the `Promise` API.
getUserSimulations().then((response) => {
  const data = response.data;
  console.log(data.users);
});
```

### Using `GetUserSimulations`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getUserSimulationsRef } from '@dataconnect/generated';


// Call the `getUserSimulationsRef()` function to get a reference to the query.
const ref = getUserSimulationsRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getUserSimulationsRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.users);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.users);
});
```

## ListRobotHistoricalEvents
You can execute the `ListRobotHistoricalEvents` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
listRobotHistoricalEvents(vars: ListRobotHistoricalEventsVariables, options?: ExecuteQueryOptions): QueryPromise<ListRobotHistoricalEventsData, ListRobotHistoricalEventsVariables>;

interface ListRobotHistoricalEventsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: ListRobotHistoricalEventsVariables): QueryRef<ListRobotHistoricalEventsData, ListRobotHistoricalEventsVariables>;
}
export const listRobotHistoricalEventsRef: ListRobotHistoricalEventsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
listRobotHistoricalEvents(dc: DataConnect, vars: ListRobotHistoricalEventsVariables, options?: ExecuteQueryOptions): QueryPromise<ListRobotHistoricalEventsData, ListRobotHistoricalEventsVariables>;

interface ListRobotHistoricalEventsRef {
  ...
  (dc: DataConnect, vars: ListRobotHistoricalEventsVariables): QueryRef<ListRobotHistoricalEventsData, ListRobotHistoricalEventsVariables>;
}
export const listRobotHistoricalEventsRef: ListRobotHistoricalEventsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the listRobotHistoricalEventsRef:
```typescript
const name = listRobotHistoricalEventsRef.operationName;
console.log(name);
```

### Variables
The `ListRobotHistoricalEvents` query requires an argument of type `ListRobotHistoricalEventsVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface ListRobotHistoricalEventsVariables {
  startTime: TimestampString;
}
```
### Return Type
Recall that executing the `ListRobotHistoricalEvents` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ListRobotHistoricalEventsData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `ListRobotHistoricalEvents`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, listRobotHistoricalEvents, ListRobotHistoricalEventsVariables } from '@dataconnect/generated';

// The `ListRobotHistoricalEvents` query requires an argument of type `ListRobotHistoricalEventsVariables`:
const listRobotHistoricalEventsVars: ListRobotHistoricalEventsVariables = {
  startTime: ..., 
};

// Call the `listRobotHistoricalEvents()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await listRobotHistoricalEvents(listRobotHistoricalEventsVars);
// Variables can be defined inline as well.
const { data } = await listRobotHistoricalEvents({ startTime: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await listRobotHistoricalEvents(dataConnect, listRobotHistoricalEventsVars);

console.log(data.robotEvents);

// Or, you can use the `Promise` API.
listRobotHistoricalEvents(listRobotHistoricalEventsVars).then((response) => {
  const data = response.data;
  console.log(data.robotEvents);
});
```

### Using `ListRobotHistoricalEvents`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, listRobotHistoricalEventsRef, ListRobotHistoricalEventsVariables } from '@dataconnect/generated';

// The `ListRobotHistoricalEvents` query requires an argument of type `ListRobotHistoricalEventsVariables`:
const listRobotHistoricalEventsVars: ListRobotHistoricalEventsVariables = {
  startTime: ..., 
};

// Call the `listRobotHistoricalEventsRef()` function to get a reference to the query.
const ref = listRobotHistoricalEventsRef(listRobotHistoricalEventsVars);
// Variables can be defined inline as well.
const ref = listRobotHistoricalEventsRef({ startTime: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = listRobotHistoricalEventsRef(dataConnect, listRobotHistoricalEventsVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.robotEvents);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.robotEvents);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## CreateNewSimulation
You can execute the `CreateNewSimulation` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
createNewSimulation(vars: CreateNewSimulationVariables): MutationPromise<CreateNewSimulationData, CreateNewSimulationVariables>;

interface CreateNewSimulationRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateNewSimulationVariables): MutationRef<CreateNewSimulationData, CreateNewSimulationVariables>;
}
export const createNewSimulationRef: CreateNewSimulationRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
createNewSimulation(dc: DataConnect, vars: CreateNewSimulationVariables): MutationPromise<CreateNewSimulationData, CreateNewSimulationVariables>;

interface CreateNewSimulationRef {
  ...
  (dc: DataConnect, vars: CreateNewSimulationVariables): MutationRef<CreateNewSimulationData, CreateNewSimulationVariables>;
}
export const createNewSimulationRef: CreateNewSimulationRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the createNewSimulationRef:
```typescript
const name = createNewSimulationRef.operationName;
console.log(name);
```

### Variables
The `CreateNewSimulation` mutation requires an argument of type `CreateNewSimulationVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface CreateNewSimulationVariables {
  id: UUIDString;
  name: string;
  simulationData: string;
  status: string;
  robotId: UUIDString;
  userId: UUIDString;
}
```
### Return Type
Recall that executing the `CreateNewSimulation` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CreateNewSimulationData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CreateNewSimulationData {
  simulation_insert: Simulation_Key;
}
```
### Using `CreateNewSimulation`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, createNewSimulation, CreateNewSimulationVariables } from '@dataconnect/generated';

// The `CreateNewSimulation` mutation requires an argument of type `CreateNewSimulationVariables`:
const createNewSimulationVars: CreateNewSimulationVariables = {
  id: ..., 
  name: ..., 
  simulationData: ..., 
  status: ..., 
  robotId: ..., 
  userId: ..., 
};

// Call the `createNewSimulation()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createNewSimulation(createNewSimulationVars);
// Variables can be defined inline as well.
const { data } = await createNewSimulation({ id: ..., name: ..., simulationData: ..., status: ..., robotId: ..., userId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await createNewSimulation(dataConnect, createNewSimulationVars);

console.log(data.simulation_insert);

// Or, you can use the `Promise` API.
createNewSimulation(createNewSimulationVars).then((response) => {
  const data = response.data;
  console.log(data.simulation_insert);
});
```

### Using `CreateNewSimulation`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, createNewSimulationRef, CreateNewSimulationVariables } from '@dataconnect/generated';

// The `CreateNewSimulation` mutation requires an argument of type `CreateNewSimulationVariables`:
const createNewSimulationVars: CreateNewSimulationVariables = {
  id: ..., 
  name: ..., 
  simulationData: ..., 
  status: ..., 
  robotId: ..., 
  userId: ..., 
};

// Call the `createNewSimulationRef()` function to get a reference to the mutation.
const ref = createNewSimulationRef(createNewSimulationVars);
// Variables can be defined inline as well.
const ref = createNewSimulationRef({ id: ..., name: ..., simulationData: ..., status: ..., robotId: ..., userId: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = createNewSimulationRef(dataConnect, createNewSimulationVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.simulation_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.simulation_insert);
});
```

