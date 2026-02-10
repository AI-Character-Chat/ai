'use client';

import { useState, useEffect, useCallback } from 'react';

export interface Persona {
  id: string;
  name: string;
  age: number | null;
  gender: string;
  description: string | null;
  isDefault: boolean;
}

export interface PersonaFormData {
  name: string;
  age: string;
  gender: string;
  description: string;
}

const INITIAL_FORM: PersonaFormData = { name: '', age: '', gender: 'private', description: '' };

export function usePersonas(autoFetch = true) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<PersonaFormData>(INITIAL_FORM);
  const [formSubmitting, setFormSubmitting] = useState(false);

  const fetchPersonas = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/personas');
      const data = await response.json();
      setPersonas(data.personas || []);
    } catch (error) {
      console.error('Failed to fetch personas:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) fetchPersonas();
  }, [autoFetch, fetchPersonas]);

  const openAddForm = useCallback(() => {
    setEditingPersona(null);
    setFormData(INITIAL_FORM);
    setShowForm(true);
  }, []);

  const openEditForm = useCallback((persona: Persona) => {
    setEditingPersona(persona);
    setFormData({
      name: persona.name,
      age: persona.age?.toString() || '',
      gender: persona.gender,
      description: persona.description || '',
    });
    setShowForm(true);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingPersona(null);
  }, []);

  const submitForm = useCallback(async (): Promise<boolean> => {
    if (!formData.name.trim()) {
      alert('닉네임을 입력해주세요.');
      return false;
    }
    setFormSubmitting(true);
    try {
      const method = editingPersona ? 'PUT' : 'POST';
      const body = editingPersona ? { id: editingPersona.id, ...formData } : formData;
      const response = await fetch('/api/personas', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setShowForm(false);
        await fetchPersonas();
        return true;
      } else {
        const error = await response.json();
        alert(error.error || '저장에 실패했습니다.');
        return false;
      }
    } catch {
      alert('저장에 실패했습니다.');
      return false;
    } finally {
      setFormSubmitting(false);
    }
  }, [editingPersona, formData, fetchPersonas]);

  const deletePersona = useCallback(async (id: string): Promise<boolean> => {
    if (!confirm('이 페르소나를 삭제하시겠습니까?')) return false;
    try {
      const response = await fetch(`/api/personas?id=${id}`, { method: 'DELETE' });
      if (response.ok) {
        await fetchPersonas();
        return true;
      }
      return false;
    } catch {
      console.error('Failed to delete persona');
      return false;
    }
  }, [fetchPersonas]);

  const setDefault = useCallback(async (persona: Persona): Promise<boolean> => {
    try {
      const response = await fetch('/api/personas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...persona, isDefault: true }),
      });
      if (response.ok) {
        await fetchPersonas();
        return true;
      }
      return false;
    } catch {
      console.error('Failed to set default persona');
      return false;
    }
  }, [fetchPersonas]);

  return {
    personas, loading, editingPersona,
    showForm, formData, formSubmitting,
    setFormData, fetchPersonas,
    openAddForm, openEditForm, closeForm, submitForm,
    deletePersona, setDefault,
  };
}

export function getGenderText(gender: string): string {
  switch (gender) {
    case 'male': return '남';
    case 'female': return '여';
    default: return '비공개';
  }
}
