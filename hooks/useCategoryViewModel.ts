import { useFocusEffect } from '@react-navigation/native';
import React, { useState } from 'react';
import * as CategoryService from '../services/CategoryService';
import * as ExpenseService from '../services/ExpenseService';
import { Category, generateCategoryId } from '../models/Category';

export const useCategoryViewModel = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadCategories = async () => {
    console.log('📂 Categories: Iniciando carga de categorías...');
    setIsLoading(true);
    try {
      // Obtener el usuario actual para cargar sus categorías
      const user = await import('../services/AuthService').then(auth => auth.getLastLoggedInUser());
      if (!user) {
        console.log('⚠️ Categories: Sin usuario logueado');
        setCategories([]);
        return;
      }
      
      // Intentar cargar categorías con timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout cargando categorías')), 3000)
      );
      
      const loadPromise = CategoryService.getCategories(user.email);
      const data = await Promise.race([loadPromise, timeoutPromise]) as any[];
      
      console.log('📂 Categories: Categorías cargadas:', data.length, 'categorías');
      setCategories(data);
    } catch (error) {
      console.log('❌ Categories: Error cargando categorías, modo offline:', error);
      setCategories([]); // Trabajar sin categorías en modo offline
    } finally {
      setIsLoading(false);
      console.log('✅ Categories: Carga de categorías completada');
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadCategories();
    }, [])
  );

  const addCategory = async (name: string, sociedad: string, centro: string, cuenta: string, ordenco: string): Promise<boolean> => {
    if (!name) {
      alert('El nombre de la categoría es requerido.');
      return false;
    }
    
    try {
      // Obtener el usuario actual
      const user = await import('../services/AuthService').then(auth => auth.getLastLoggedInUser());
      if (!user) {
        alert('Error: No hay usuario logueado.');
        return false;
      }
      if (!sociedad || !centro || !cuenta || !ordenco) {
        alert('Para crear una categoría debes completar Sociedad, Centro, Cuenta y Orden CO.');
        return false;
      }

      const newCategory: Category = {
        id: generateCategoryId(),
        name,
        sociedad: sociedad || undefined,
        centro: centro || undefined,
        cuenta: cuenta || undefined,
        ordenco: ordenco || undefined,
        email: user.email,
        needsSync: true
      };
      
      console.log('📂 Categories: Agregando nueva categoría:', newCategory);
      await CategoryService.addCategory(newCategory, user.email);
      loadCategories(); // Refresh list
      return true;
    } catch (error) {
      console.error('❌ Categories: Error agregando categoría:', error);
      alert('Error agregando categoría');
      return false;
    }
  };

  const removeCategory = async (id: string) => {
    try {
      const user = await import('../services/AuthService').then(auth => auth.getLastLoggedInUser());
      if (!user) {
        alert('Error: No hay usuario logueado.');
        return;
      }
      await CategoryService.deleteCategory(id, user.email);
      loadCategories(); // Refresh list
    } catch (error) {
      console.error('❌ Categories: Error eliminando categoría:', error);
      alert('Error eliminando categoría');
    }
  };

  const getDraftExpensesUsingCategory = async (categoryName: string) => {
    const user = await import('../services/AuthService').then(auth => auth.getLastLoggedInUser());
    if (!user) {
      return [];
    }

    return ExpenseService.getDraftExpensesByCategoryName(user.email, categoryName);
  };

  
  const updateCategory = async (updatedCategory: Category) => {
    try {
      const user = await import('../services/AuthService').then(auth => auth.getLastLoggedInUser());
      if (!user) {
        alert('Error: No hay usuario logueado.');
        return 0;
      }
      const updatedDraftExpenses = await CategoryService.updateCategory(updatedCategory, user.email);
      await loadCategories(); // Refresh list after update
      return updatedDraftExpenses;
    } catch (error) {
      console.error('❌ Categories: Error actualizando categoría:', error);
      alert('Error actualizando categoría');
      return 0;
    }
  };

  const countDraftExpensesUsingCategory = async (categoryName: string) => {
    const user = await import('../services/AuthService').then(auth => auth.getLastLoggedInUser());
    if (!user) {
      return 0;
    }

    return ExpenseService.countDraftExpensesByCategoryName(user.email, categoryName);
  };

  return { categories, isLoading, addCategory, updateCategory, removeCategory, countDraftExpensesUsingCategory, getDraftExpensesUsingCategory };
};
