import { useFocusEffect } from '@react-navigation/native';
import React, { useState } from 'react';
import { Expense } from '../models/Expense';
import * as AuthService from '../services/AuthService';
import * as ExpenseService from '../services/ExpenseService';

export const useDashboardViewModel = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [userGreeting, setUserGreeting] = useState('Bienvenido, Usuario');


  const loadExpenses = async () => {
    console.log('📊 Dashboard: Iniciando carga de gastos...');
    setIsLoading(true);
    try {
      const email = await AuthService.getLastLoggedInUser();
      console.log('📊 Dashboard: Usuario obtenido para gastos:', email ? 'Usuario encontrado' : 'Sin usuario');
      
      if (email) {
        // Intentar cargar gastos con timeout
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout cargando gastos')), 3000)
        );
        
        const loadPromise = ExpenseService.getExpenses(email.email);
        const data = await Promise.race([loadPromise, timeoutPromise]) as Expense[];
        
        console.log('📊 Dashboard: Gastos cargados:', data.length, 'gastos');
        setExpenses(data);
      } else {
        console.log('⚠️ Dashboard: Sin usuario, no se cargan gastos');
        setExpenses([]);
      }
    } catch (error) {
      console.log('❌ Dashboard: Error cargando gastos, modo offline:', error);
      setExpenses([]); // Trabajar sin datos en modo offline
    } finally {
      setIsLoading(false);
      console.log('✅ Dashboard: Carga de gastos completada');
    }
  };


  const loadUserGreeting = async () => {
    console.log('👋 Dashboard: Cargando saludo de usuario...');
    try {
      const user = await AuthService.getLastLoggedInUser();
      if (user) {
        setUserGreeting(`Bienvenido, ${user.firstName} ${user.lastName} - Empleado`);
        console.log('✅ Dashboard: Saludo configurado para:', user.firstName);
      } else {
        setUserGreeting('Bienvenido, Usuario');
        console.log('⚠️ Dashboard: No se encontró usuario para saludo');
      }
    } catch (error) {
      console.log('❌ Dashboard: Error cargando saludo:', error);
      setUserGreeting('Bienvenido, Usuario');
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadExpenses();
      loadUserGreeting();
    }, [])
  );

  // Compute dashboard metrics
  const totalExpenses = expenses.length;
  const pending = expenses.filter(exp => exp.status === 'ENVIADO_JEFE' || exp.status === 'BORRADOR').length;
  const approved = expenses.filter(exp => exp.status === 'APROBADO_JEFE' || exp.status === 'APROBADO_FINANZAS' || exp.status === 'CONTABILIZADO').length;
  const rejected = expenses.filter(exp => exp.status === 'RECHAZADO_JEFE' || exp.status === 'RECHAZADO_FINANZAS' || exp.status === 'ERROR_SAP').length;
  const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  return { totalExpenses, pending, approved, rejected, totalAmount, isLoading, userGreeting};
};