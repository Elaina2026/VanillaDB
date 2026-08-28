import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client.js';

interface AuthContextType {
  initialized: boolean;
  authenticated: boolean;
  user: { userId: string; username: string } | null;
  isLoading: boolean;
  logout: () => void;
  refetchStatus: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['authStatus'],
    queryFn: () => apiRequest('/api/auth/status'),
    retry: false,
    staleTime: 1000 * 60,
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['authStatus'] });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        initialized: data?.initialized ?? true,
        authenticated: data?.authenticated ?? false,
        user: data?.user ?? null,
        isLoading,
        logout: () => logoutMutation.mutate(),
        refetchStatus: () => refetch(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
