'use client';

import React, { useState } from 'react';
import {
  X,
  ListTodo,
  UserCheck,
  Calendar,
  CheckCircle2,
  Plus,
  Trash2,
} from 'lucide-react';
import * as api from '../../lib/api';
import { TaskType, TaskChecklistItem } from '../../lib/types';

interface TaskAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportId: string;
  reportTrackingCode: string;
  matchId?: string | null;
  defaultTitle?: string;
  defaultType?: TaskType;
  onTaskCreated?: () => void;
}

export function TaskAssignmentModal({
  isOpen,
  onClose,
  reportId,
  reportTrackingCode,
  matchId,
  defaultTitle = 'Deliver Relief Supplies to Crisis Site',
  defaultType = 'DELIVER_SUPPLIES',
  onTaskCreated,
}: TaskAssignmentModalProps) {
  const [type, setType] = useState<TaskType>(defaultType);
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(
    `Dispatched field assignment for case ${reportTrackingCode}.`
  );
  const [assigneeName, setAssigneeName] = useState('Rapid Response Team Alpha');
  const [deadline, setDeadline] = useState(
    new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 16)
  );
  const [checklist, setChecklist] = useState<TaskChecklistItem[]>([
    { id: 'c1', text: 'Confirm arrival at distribution depot', completed: false },
    { id: 'c2', text: 'Inspect packaging and inventory count', completed: false },
    { id: 'c3', text: 'Obtain signature from local community leader', completed: false },
  ]);
  const [newItemText, setNewItemText] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  function handleAddChecklistItem() {
    if (!newItemText.trim()) return;
    setChecklist((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}`,
        text: newItemText.trim(),
        completed: false,
      },
    ]);
    setNewItemText('');
  }

  function handleRemoveItem(id: string) {
    setChecklist((prev) => prev.filter((i) => i.id !== id));
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      await api.createTask({
        reportId,
        matchId: matchId || null,
        type,
        title,
        description,
        assigneeName,
        deadline: new Date(deadline).toISOString(),
        checklist,
      });

      if (onTaskCreated) onTaskCreated();
      onClose();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to dispatch task');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <ListTodo className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            Dispatch Field Response Task
          </h2>
        </div>
        <p className="text-xs text-slate-500 mb-6">
          Coordinate on-the-ground execution for case <strong>{reportTrackingCode}</strong>.
          Every status update automatically registers on the case timeline.
        </p>

        <form onSubmit={handleCreateTask} className="space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200">
              {errorMessage}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Task Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TaskType)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-semibold"
            >
              <option value="DELIVER_SUPPLIES">Deliver Relief Supplies</option>
              <option value="EVACUATE">Evacuate Trapped Residents</option>
              <option value="MEDICAL_VISIT">Medical Assessment / Visit</option>
              <option value="SEARCH_RESCUE">Search & Rescue Mission</option>
              <option value="DAMAGE_ASSESSMENT">Field Damage Assessment</option>
              <option value="OTHER">Other Operational Mission</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Task Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Assignee / Unit Name
              </label>
              <input
                type="text"
                value={assigneeName}
                onChange={(e) => setAssigneeName(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Completion Deadline
              </label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Interactive Checklist Builder */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Field Execution Checklist
            </label>
            <div className="space-y-2 mb-2">
              {checklist.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {idx + 1}. {item.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.id)}
                    className="text-slate-400 hover:text-red-600 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                placeholder="Add checklist step..."
                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={handleAddChecklistItem}
                className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 font-bold text-xs rounded-xl hover:bg-slate-300 transition"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 font-bold text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition disabled:opacity-50"
            >
              {loading ? 'Dispatching...' : 'Dispatch Field Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
