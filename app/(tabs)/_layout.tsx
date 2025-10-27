import { Ionicons } from '@expo/vector-icons'; // A popular icon library
import { Tabs } from 'expo-router';
import React from 'react';
import { useManagerSync } from '../../hooks/useManagerSync';


export default function TabLayout() {
  // Activar sincronización automática de liquidaciones para managers
  // Se ejecuta cada 5 minutos en background sin afectar el performance
  useManagerSync({
    enabled: true,
    intervalMinutes: 5  // Cada 5 minutos
  });

  return (
    <Tabs
      screenOptions={{
        headerShown: false, // Ensure header is shown
        
      }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: 'Gastos',
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="liquidations"
        options={{
          title: 'Liquidaciones',
          tabBarIcon: ({ color, size }) => <Ionicons name="folder-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="categories"
        options={{
          title: 'Categorías',
          tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Configuración',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

