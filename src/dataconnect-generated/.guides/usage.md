# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.




### React
For each operation, there is a wrapper hook that can be used to call the operation.

Here are all of the hooks that get generated:
```ts
import { useListAllDigitalTwinModels, useGetRobotById, useCreateNewSimulation, useGetUserSimulations, useListRobotHistoricalEvents } from '@dataconnect/generated/react';
// The types of these hooks are available in react/index.d.ts

const { data, isPending, isSuccess, isError, error } = useListAllDigitalTwinModels();

const { data, isPending, isSuccess, isError, error } = useGetRobotById(getRobotByIdVars);

const { data, isPending, isSuccess, isError, error } = useCreateNewSimulation(createNewSimulationVars);

const { data, isPending, isSuccess, isError, error } = useGetUserSimulations();

const { data, isPending, isSuccess, isError, error } = useListRobotHistoricalEvents(listRobotHistoricalEventsVars);

```

Here's an example from a different generated SDK:

```ts
import { useListAllMovies } from '@dataconnect/generated/react';

function MyComponent() {
  const { isLoading, data, error } = useListAllMovies();
  if(isLoading) {
    return <div>Loading...</div>
  }
  if(error) {
    return <div> An Error Occurred: {error} </div>
  }
}

// App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyComponent from './my-component';

function App() {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>
    <MyComponent />
  </QueryClientProvider>
}
```



## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { listAllDigitalTwinModels, getRobotById, createNewSimulation, getUserSimulations, listRobotHistoricalEvents } from '@dataconnect/generated';


// Operation ListAllDigitalTwinModels: 
const { data } = await ListAllDigitalTwinModels(dataConnect);

// Operation GetRobotById:  For variables, look at type GetRobotByIdVars in ../index.d.ts
const { data } = await GetRobotById(dataConnect, getRobotByIdVars);

// Operation CreateNewSimulation:  For variables, look at type CreateNewSimulationVars in ../index.d.ts
const { data } = await CreateNewSimulation(dataConnect, createNewSimulationVars);

// Operation GetUserSimulations: 
const { data } = await GetUserSimulations(dataConnect);

// Operation ListRobotHistoricalEvents:  For variables, look at type ListRobotHistoricalEventsVars in ../index.d.ts
const { data } = await ListRobotHistoricalEvents(dataConnect, listRobotHistoricalEventsVars);


```