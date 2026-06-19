import { useFocusEffect } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Expense } from '../models/Expense';
import { Liquidation } from '../models/Liquidation';
import * as AuthService from '../services/AuthService';
import { BackendSyncService } from '../services/BackendSyncService';
import * as ExpenseService from '../services/ExpenseService';
import { getLiquidations } from '../services/LiquidationService';
import { getPendingLiquidationsCount } from './useManagerSync';

export const useDashboardViewModel = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [liquidations, setLiquidations] = useState<Liquidation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userGreeting, setUserGreeting] = useState('Bienvenido, Usuario');
  const [userRole, setUserRole] = useState<'Empleado' | 'Jefe'>('Empleado');
  const [pendingLiquidationsForManager, setPendingLiquidationsForManager] = useState(0);

  // Referencias para sincronización periódica
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef(AppState.currentState);
  const authTokenRef = useRef<string | null>(null);
  const lastLoadTimestampRef = useRef<number>(0);

  /**
   * 🔄 SINCRONIZACIÓN PERIÓDICA DE DATOS DEL USUARIO
   * Descarga categorías, gastos y liquidaciones del backend cada 5 minutos
   * Esto asegura que los datos estén actualizados incluso después de reinstalar
   */
  const syncUserDataPeriodically = async () => {
    try {
      const user = await AuthService.getLastLoggedInUser();
      if (!user) {
        console.log('⚠️ DashboardSync: No hay usuario logueado');
        return;
      }

      console.log('🔄 DashboardSync: ========== SINCRONIZACIÓN PERIÓDICA ==========');
      
      // Obtener token si no lo tenemos
      if (!authTokenRef.current) {
        const pin = await AuthService.getPIN();
        if (!pin) {
          console.log('⚠️ DashboardSync: No se pudo obtener PIN');
          return;
        }

        const loginResult = await BackendSyncService.loginAndGetToken(user.email, pin);
        if (!loginResult.success || !loginResult.token) {
          console.log('⚠️ DashboardSync: No se pudo obtener token');
          return;
        }
        authTokenRef.current = loginResult.token;
      }

      // Descargar datos en paralelo
      const [categoriesResult, expensesResult, liquidationsResult] = await Promise.all([
        BackendSyncService.downloadCategoriesFromBackend(user.email, authTokenRef.current),
        BackendSyncService.downloadExpensesFromBackend(user.email, authTokenRef.current),
        BackendSyncService.downloadLiquidationsFromBackend(user.email, authTokenRef.current)
      ]);

      console.log('✅ DashboardSync: Categorías:', categoriesResult.count);
      console.log('✅ DashboardSync: Gastos:', expensesResult.count);
      console.log('✅ DashboardSync: Liquidaciones:', liquidationsResult.count);

      // Recargar datos locales después de sincronizar
      await loadExpenses();

      console.log('🔄 DashboardSync: ========== FIN SINCRONIZACIÓN ==========');
    } catch (error) {
      console.error('🚨 DashboardSync: Error en sincronización:', error);
      // Limpiar token si falla
      authTokenRef.current = null;
    }
  };

  /**
   * Iniciar sincronización periódica
   */
  useEffect(() => {
    // Sincronizar inmediatamente al montar
    syncUserDataPeriodically();

    // Configurar intervalo de 5 minutos
    console.log('🔄 DashboardSync: Configurando sincronización cada 5 minutos');
    syncIntervalRef.current = setInterval(() => {
      if (appState.current === 'active') {
        syncUserDataPeriodically();
      }
    }, 5 * 60 * 1000); // 5 minutos

    // Listener de cambios de estado de la app
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('🔄 DashboardSync: App volvió a primer plano - Sincronizando...');
        syncUserDataPeriodically();
      }
      appState.current = nextAppState;
    });

    // Cleanup
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
      subscription.remove();
    };
  }, []);


  const loadExpenses = async () => {
    // Evitar recargas frecuentes - solo recargar si han pasado más de 30 segundos
    const now = Date.now();
    const timeSinceLastLoad = now - lastLoadTimestampRef.current;
    
    if (timeSinceLastLoad < 30000) { // 30 segundos
      console.log(`⏭️ Dashboard: Omitiendo recarga (hace ${Math.round(timeSinceLastLoad / 1000)}s)`);
      return;
    }
    
    console.log('📊 Dashboard: Iniciando carga de gastos...');
    setIsLoading(true);
    try {
      const email = await AuthService.getLastLoggedInUser();
      console.log('📊 Dashboard: Usuario obtenido para gastos:', email ? 'Usuario encontrado' : 'Sin usuario');
      
      if (email) {
        // Cargar gastos y liquidaciones en paralelo
        const [expensesData, liquidationsData] = await Promise.all([
          ExpenseService.getExpenses(email.email).catch(() => []),
          getLiquidations(email.email).catch(() => [])
        ]);
        
        console.log('📊 Dashboard: Gastos cargados:', expensesData.length, 'gastos');
        console.log('📊 Dashboard: Liquidaciones cargadas:', liquidationsData.length, 'liquidaciones');
        setExpenses(expensesData);
        setLiquidations(liquidationsData);
        lastLoadTimestampRef.current = Date.now();
      } else {
        console.log('⚠️ Dashboard: Sin usuario, no se cargan datos');
        setExpenses([]);
        setLiquidations([]);
      }
    } catch (error) {
      console.log('❌ Dashboard: Error cargando datos:', error);
      setExpenses([]);
      setLiquidations([]);
    } finally {
      setIsLoading(false);
      console.log('✅ Dashboard: Carga de datos completada');
    }
  };


  const loadUserGreeting = async () => {
    console.log('👋 Dashboard: Cargando saludo de usuario...');
    try {
      const user = await AuthService.getLastLoggedInUser();
      if (user) {
        setUserGreeting(`Hola, ${user.firstName} ${user.lastName}`);

        let isManager = false;

        try {
          if (!authTokenRef.current) {
            const pin = await AuthService.getPIN();
            if (pin) {
              const loginResult = await BackendSyncService.loginAndGetToken(user.email, pin);
              if (loginResult.success && loginResult.token) {
                authTokenRef.current = loginResult.token;
              }
            }
          }

          if (authTokenRef.current) {
            const managerCheck = await BackendSyncService.checkIfUserIsManager(
              user.email,
              authTokenRef.current,
            );
            isManager = managerCheck.isManager;
            console.log(
              '✅ Dashboard: Rol validado contra backend:',
              isManager ? 'Jefe' : 'Empleado',
              '- Empleados:',
              managerCheck.employeeCount,
            );
          }
        } catch (roleError) {
          console.log('⚠️ Dashboard: No se pudo validar rol contra backend:', roleError);
        }

        setUserRole(isManager ? 'Jefe' : 'Empleado');

        const count = await getPendingLiquidationsCount();
        setPendingLiquidationsForManager(count);
        console.log('📊 Dashboard: Liquidaciones pendientes para manager:', count);
      } else {
        setUserGreeting('Bienvenido, Usuario');
        setUserRole('Empleado');
        console.log('⚠️ Dashboard: No se encontró usuario para saludo');
      }
    } catch (error) {
      console.log('❌ Dashboard: Error cargando saludo:', error);
      setUserGreeting('Bienvenido, Usuario');
      setUserRole('Empleado');
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      // Solo cargar si es la primera vez o si hace más de 30 segundos
      const timeSinceLastLoad = Date.now() - lastLoadTimestampRef.current;
      if (lastLoadTimestampRef.current === 0 || timeSinceLastLoad > 30000) {
        loadExpenses();
        loadUserGreeting();
      } else {
        console.log(`⏭️ Dashboard: Omitiendo recarga en focus (hace ${Math.round(timeSinceLastLoad / 1000)}s)`);
      }
    }, [])
  );

  // ========== MÉTRICAS DE GASTOS ==========
  // IMPORTANTE: Excluir gastos anulados de todos los cálculos
  const activeExpenses = expenses.filter(exp => exp.expenseStatus !== 'voided');
  
  const totalExpenses = activeExpenses.length;
  
  // Usar expenseStatus (flujo de liquidación) en lugar de status (flujo de aprobación)
  // para mantener consistencia con la pantalla de gastos
  const expensesDraft = activeExpenses.filter(exp => exp.expenseStatus === 'draft').length;
  const expensesPendingManager = activeExpenses.filter(exp => exp.expenseStatus === 'in_liquidation').length;
  const expensesApproved = activeExpenses.filter(exp => exp.expenseStatus === 'approved').length;
  
  // Los rechazados se cuentan por el campo status ya que no hay expenseStatus='rejected'
  const expensesRejected = activeExpenses.filter(exp => 
    exp.status === 'RECHAZADO_JEFE' || 
    exp.status === 'RECHAZADO_FINANZAS' || 
    exp.status === 'ERROR_SAP'
  ).length;
  
  // Gastos disponibles para liquidación (en draft y sin liquidationId)
  const expensesAvailableForLiquidation = activeExpenses.filter(exp => 
    exp.expenseStatus === 'draft' && !exp.liquidationId
  ).length;

  // ========== MÉTRICAS DE LIQUIDACIONES ==========
  const totalLiquidations = liquidations.length;
  const liquidationsDraft = liquidations.filter(liq => liq.status === 'draft').length;
  const liquidationsSubmitted = liquidations.filter(liq => liq.status === 'submitted').length;
  const liquidationsApproved = liquidations.filter(liq => liq.status === 'approved').length;
  const liquidationsRejected = liquidations.filter(liq => liq.status === 'rejected').length;

  // ========== MÉTRICAS DE MONTOS ==========
  // IMPORTANTE: Excluir gastos anulados del total de montos
  const totalAmountExpenses = activeExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const totalAmountLiquidations = liquidations.reduce((sum, liq) => sum + liq.totalAmount, 0);
  const pendingAmountToLiquidate = activeExpenses
    .filter(exp => exp.status === 'APROBADO_JEFE' && !exp.liquidationId)
    .reduce((sum, exp) => sum + exp.amount, 0);

  return { 
    // Datos base
    expenses,
    liquidations,
    isLoading, 
    userGreeting,
    userRole,
    
    // Métricas de gastos
    totalExpenses,
    expensesDraft,
    expensesPendingManager,
    expensesApproved,
    expensesRejected,
    expensesAvailableForLiquidation,
    
    // Métricas de liquidaciones
    totalLiquidations,
    liquidationsDraft,
    liquidationsSubmitted,
    liquidationsApproved,
    liquidationsRejected,
    
    // Métricas para managers
    pendingLiquidationsForManager,
    
    // Métricas de montos
    totalAmountExpenses,
    totalAmountLiquidations,
    pendingAmountToLiquidate,
  };
};
