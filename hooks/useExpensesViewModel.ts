import { useFocusEffect } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Expense, getExpenseStatusText, ExpenseStatus } from '../models/Expense';
import * as ExpenseService from '../services/ExpenseService';

export const useExpensesViewModel = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('Todos los estados');

  const loadExpenses = async () => {
    console.log('💳 Expenses: Iniciando carga de gastos...');
    setIsLoading(true);
    try {
      // Obtener el usuario actual para cargar sus gastos
      const AuthService = await import('../services/AuthService');
      const user = await AuthService.getLastLoggedInUser();
      
      if (!user) {
        console.log('⚠️ Expenses: Sin usuario logueado');
        setExpenses([]);
        return;
      }
      
      // Intentar cargar gastos con timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout cargando gastos')), 3000)
      );
      
      const loadPromise = ExpenseService.getExpenses(user.email);
      const data = await Promise.race([loadPromise, timeoutPromise]) as Expense[];
      
      console.log('💳 Expenses: Gastos cargados:', data.length, 'gastos');
      setExpenses(data);
    } catch (error) {
      console.log('❌ Expenses: Error cargando gastos, modo offline:', error);
      setExpenses([]); // Trabajar sin gastos en modo offline
    } finally {
      setIsLoading(false);
      console.log('✅ Expenses: Carga de gastos completada');
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadExpenses(); // Reload when screen is focused
      return () => {}; // Cleanup if needed
    }, [])
  );

  const filteredExpenses = useMemo(() => {
    if (filterStatus === 'Todos los estados') {
      return expenses;
    }
    
    // Mapear el texto del filtro al expenseStatus correcto
    const statusMap: { [key: string]: ExpenseStatus } = {
      'Borrador': 'draft',
      'En Liquidación': 'in_liquidation',
      'Autorizado': 'approved',
      'Anulado': 'voided'
    };
    
    const targetStatus = statusMap[filterStatus];
    if (!targetStatus) {
      return expenses;
    }
    
    return expenses.filter(expense => expense.expenseStatus === targetStatus);
  }, [expenses, filterStatus]);

  return {
    expenses: filteredExpenses,
    isLoading,
    setFilterStatus,
    loadExpenses, // Exportar para poder recargar manualmente
  };
};