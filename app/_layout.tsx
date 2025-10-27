import { Stack, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import * as AuthService from '../services/AuthService';
import * as CategoryService from '../services/CategoryService';
import * as ExpenseService from '../services/ExpenseService';

// Mantener el splash visible mientras carga la app
SplashScreen.preventAutoHideAsync();


export default function RootLayoutNav() {
  const router = useRouter();

  useEffect(() => {
    const checkUserAndNavigate = async () => {
      try {
        console.log('🔄 _layout: Iniciando verificación de usuario...');
        
        // Dar más tiempo a AsyncStorage para inicializar en Android
        // Aumentado de 100ms a 300ms para asegurar que AsyncStorage esté listo
        await new Promise(resolve => setTimeout(resolve, 300));
        console.log('✅ _layout: Delay de AsyncStorage completado');
        
        // Inicializar las bases de datos locales
        console.log('🗄️ _layout: Inicializando bases de datos...');
        try {
          await Promise.race([
            Promise.all([
              CategoryService.initDB(),
              ExpenseService.initDB(),
              (async () => {
                const { initLiquidationsTable } = await import('../services/LiquidationService');
                initLiquidationsTable();
              })()
            ]),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('SQLite timeout')), 5000)
            )
          ]);
          console.log('✅ _layout: Bases de datos inicializadas correctamente');
        } catch (error) {
          console.log('⚠️ _layout: Error o timeout en SQLite, continuando sin DB:', error);
        }
        
        const lastUser = await AuthService.getLastLoggedInUser();
        console.log('📱 _layout: getLastLoggedInUser resultado:', lastUser ? 'Usuario encontrado' : 'Sin usuario');

        if (lastUser) {
          console.log('🔄 _layout: Navegando a unlock...');
          // Navegamos a 'unlock' y pasamos el email como parámetro
          router.replace({
            pathname: '/unlock',
            params: { email: lastUser.email },
          });
        } else {
          console.log('🔄 _layout: Navegando a setup...');
          // Si no hay usuario, vamos a setup
          router.replace('/setup');
        }
        
        console.log('✅ _layout: Navegación completada');
      } catch (error) {
        console.error('❌ _layout: Error checking user:', error);
        // En caso de error, ir a setup por defecto
        console.log('🔄 _layout: Navegando a setup por error...');
        router.replace('/setup');
      } finally {
        console.log('🎬 _layout: Ocultando splash screen...');
        // Ocultar splash screen una vez completada la navegación
        try {
          await SplashScreen.hideAsync();
          console.log('✅ _layout: Splash screen oculto');
        } catch (splashError) {
          console.error('❌ _layout: Error ocultando splash:', splashError);
        }
      }
    };

    checkUserAndNavigate();
  }, []);

  // While the check is running, we can show a loading screen or return null.
  // Returning the Stack directly is also fine as the redirect is fast.
  return (
      <Stack>
        <Stack.Screen name="setup" options={{ headerShown: false }} />
        <Stack.Screen name="unlock" options={{ headerShown: false }} />
        {/* We will add the main dashboard screen here later, e.g., (tabs) */}
        <Stack.Screen 
        name="(tabs)" 
        options={{ 
          title: 'EasyGastos',
          headerShown: true // Make sure the header is visible
        }} 
      />
      </Stack>
  );
}