import { useUpdates } from '@hooks/persisted';
import React, { createContext, useContext } from 'react';

type UpdateContextType = ReturnType<typeof useUpdates>;

const defaultValue = {} as UpdateContextType;
const UpdateContext = createContext<UpdateContextType>(defaultValue);

export function UpdateContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const updateParams = useUpdates();

  return (
    <UpdateContext.Provider value={updateParams}>
      {children}
    </UpdateContext.Provider>
  );
}

export const useUpdateContext = (): UpdateContextType => {
  return useContext(UpdateContext);
};
