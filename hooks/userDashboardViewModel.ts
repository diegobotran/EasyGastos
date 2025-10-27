import { useFocusEffect } from '@react-navigation/native';
import React, { useState } from 'react';
import { Expense } from '../models/Expense';
import { Liquidation } from '../models/Liquidation';
import * as AuthService from '../services/AuthService';
import * as ExpenseService from '../services/ExpenseService';
import { getLiquidations } from '../services/LiquidationService';

export const useDashboardViewModel = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [liquidations, setLiquidations] = useState<Liquidation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userGreeting, setUserGreeting] = useState('Bienvenido, Usuario');
  const [userRole, setUserRole] = useState<'Empleado' | 'Jefe'>('Empleado');


  const loadExpenses = async () => {
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
        // Verificar si es jefe (simplificado - podrías usar BackendSyncService.checkIfUserIsManager)
        const isManager = user.role === 'manager' || user.isManager;
        setUserRole(isManager ? 'Jefe' : 'Empleado');
        setUserGreeting(`Hola, ${user.firstName} ${user.lastName}`);
        console.log('✅ Dashboard: Saludo configurado para:', user.firstName, '- Rol:', isManager ? 'Jefe' : 'Empleado');
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
      loadExpenses();
      loadUserGreeting();
    }, [])
  );

  // ========== MÉTRICAS DE GASTOS ==========
  const totalExpenses = expenses.length;
  const expensesDraft = expenses.filter(exp => exp.status === 'BORRADOR').length;
  const expensesPendingManager = expenses.filter(exp => exp.status === 'ENVIADO_JEFE').length;
  const expensesApproved = expenses.filter(exp => 
    exp.status === 'APROBADO_JEFE' || 
    exp.status === 'APROBADO_FINANZAS' || 
    exp.status === 'CONTABILIZADO'
  ).length;
  const expensesRejected = expenses.filter(exp => 
    exp.status === 'RECHAZADO_JEFE' || 
    exp.status === 'RECHAZADO_FINANZAS' || 
    exp.status === 'ERROR_SAP'
  ).length;
  
  // Gastos disponibles para liquidación (aprobados por jefe pero no en liquidación)
  const expensesAvailableForLiquidation = expenses.filter(exp => 
    exp.status === 'APROBADO_JEFE' && !exp.liquidationId
  ).length;

  // ========== MÉTRICAS DE LIQUIDACIONES ==========
  const totalLiquidations = liquidations.length;
  const liquidationsDraft = liquidations.filter(liq => liq.status === 'draft').length;
  const liquidationsSubmitted = liquidations.filter(liq => liq.status === 'submitted').length;
  const liquidationsApproved = liquidations.filter(liq => liq.status === 'approved').length;
  const liquidationsRejected = liquidations.filter(liq => liq.status === 'rejected').length;

  // ========== MÉTRICAS DE MONTOS ==========
  const totalAmountExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const totalAmountLiquidations = liquidations.reduce((sum, liq) => sum + liq.totalAmount, 0);
  const pendingAmountToLiquidate = expenses
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
    
    // Métricas de montos
    totalAmountExpenses,
    totalAmountLiquidations,
    pendingAmountToLiquidate,
  };
};