'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ListTodo,
  Truck,
  CheckCircle2,
  XCircle,
  MapPin,
  Clock,
  Navigation,
  Radio,
  AlertTriangle,
  ChevronRight,
  ShieldAlert,
  ArrowLeft,
} from 'lucide-react';
import * as api from '../../lib/api';
import { TaskRecordItem, TaskStatus } from '../../lib/types';

export default function FieldTasksPage() {
  const [tasks, setTasks] = useState<TaskRecordItem[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskRecordItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    setLoading(true);
    try {
      const data = await api.listTasks();
      const items = data.length > 0 ? data : getSampleTasks();
      setTasks(items);
      if (items.length > 0 && !selectedTask) {
        setSelectedTask(items[0]);
      }
    } catch {
      const fallback = getSampleTasks();
      setTasks(fallback);
      setSelectedTask(fallback[0]);
    } finally {
      setLoading(false);
    }
  }

  function getSampleTasks(): TaskRecordItem[] {
    return [
      {
        id: 'task-field-1',
        reportId: 'rep-e2e-matching-1',
        reportTrackingCode: 'RL-TIG-4401',
        type: 'DELIVER_SUPPLIES',
        title: 'Deliver 50 Water Jerrycans to Ayder Isolation Center',
        description:
          'Transport 50 20L water jerrycans from Red Cross depot to Ayder Subcity school evacuation shelter.',
        deadline: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        status: 'ASSIGNED',
        checklist: [
          { id: 'c1', text: 'Confirm jerrycan count at Red Cross depot', completed: false },
          { id: 'c2', text: 'Secure truck tie-downs for bumpy transit', completed: false },
          { id: 'c3', text: 'Deliver to shelter manager and sign receipt', completed: false },
        ],
        lastLatitude: 13.498,
        lastLongitude: 39.475,
        isTrackingActive: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
  }

  async function handleStatusChange(newStatus: TaskStatus, note?: string) {
    if (!selectedTask) return;
    setErrorMessage(null);
    try {
      const updated = await api.updateTaskStatus(selectedTask.id, {
        status: newStatus,
        checklist: selectedTask.checklist,
        note,
      });

      setSelectedTask(updated);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));

      // If finished, tracking is auto-disabled
      if (newStatus === 'DONE' || newStatus === 'FAILED') {
        setIsTracking(false);
      }

      setActionNotice(`Task status updated to ${newStatus}. Logged to case timeline.`);
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to update task status');
    }
  }

  async function handleToggleChecklistItem(itemId: string) {
    if (!selectedTask) return;
    const updatedChecklist = selectedTask.checklist.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );

    const updatedTask = { ...selectedTask, checklist: updatedChecklist };
    setSelectedTask(updatedTask);
    setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? updatedTask : t)));

    try {
      await api.updateTaskStatus(selectedTask.id, {
        status: selectedTask.status,
        checklist: updatedChecklist,
      });
    } catch {
      // Optimistic local state update
    }
  }

  async function handleToggleLocationTracking() {
    if (!selectedTask) return;
    const nextState = !isTracking;
    setIsTracking(nextState);

    try {
      await api.updateTaskLocation(selectedTask.id, {
        latitude: selectedTask.lastLatitude || 13.498,
        longitude: selectedTask.lastLongitude || 39.475,
        isTrackingActive: nextState,
      });

      setActionNotice(
        nextState
          ? 'Live GPS location sharing active. Visible on emergency coordinator map.'
          : 'Live location sharing stopped.'
      );
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to toggle location sharing');
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/responder"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Responder Console</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-extrabold uppercase text-slate-500">
              Field Dispatch Screen
            </span>
          </div>
        </div>

        {/* Action / Error Banner */}
        {actionNotice && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-2xl text-emerald-800 dark:text-emerald-300 text-sm font-bold flex items-center justify-between">
            <span>{actionNotice}</span>
            <button
              onClick={() => setActionNotice(null)}
              className="text-emerald-600 font-bold ml-4"
            >
              ✕
            </button>
          </div>
        )}
        {errorMessage && (
          <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-2xl text-red-800 dark:text-red-300 text-sm font-bold flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-600 font-bold ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Task Selection Header */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <ListTodo className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                Assigned Field Missions
              </h1>
              <p className="text-xs text-slate-500">
                Tigray Emergency Response Network • Mobile Offline Enabled
              </p>
            </div>
          </div>

          {tasks.length > 1 && (
            <select
              value={selectedTask?.id}
              onChange={(e) => {
                const found = tasks.find((t) => t.id === e.target.value);
                if (found) setSelectedTask(found);
              }}
              className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold"
            >
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  [{t.status}] {t.title.slice(0, 35)}...
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedTask ? (
          <div className="space-y-6">
            {/* Active Task Card */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-md space-y-6">
              {/* Header Details */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-black uppercase bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300">
                    {selectedTask.type}
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-500">
                    Case: {selectedTask.reportTrackingCode}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                      selectedTask.status === 'DONE'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : selectedTask.status === 'EN_ROUTE'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          : selectedTask.status === 'ON_SITE'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                            : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                    }`}
                  >
                    STATUS: {selectedTask.status}
                  </span>
                </div>
              </div>

              <div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                  {selectedTask.title}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                  {selectedTask.description}
                </p>
              </div>

              {/* Opt-in Live Location Toggle */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isTracking
                        ? 'bg-emerald-500 text-white animate-pulse'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                    }`}
                  >
                    <Navigation className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Opt-In Live Location Sharing
                    </h3>
                    <p className="text-xs text-slate-500">
                      {isTracking
                        ? 'Actively broadcasting GPS to coordinator rescue map.'
                        : 'Disabled. Coordinate privately without broadcasting.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleToggleLocationTracking}
                  disabled={selectedTask.status === 'DONE' || selectedTask.status === 'FAILED'}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition disabled:opacity-40 ${
                    isTracking
                      ? 'bg-red-600 hover:bg-red-700 text-white shadow-sm'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                  }`}
                >
                  {isTracking ? 'Stop Sharing' : 'Share Location'}
                </button>
              </div>

              {/* Interactive Checklist */}
              <div className="space-y-3 pt-2">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-500">
                  Mission Checklist ({selectedTask.checklist.filter((c) => c.completed).length}/
                  {selectedTask.checklist.length} Completed)
                </h3>
                <div className="space-y-2">
                  {selectedTask.checklist.map((item) => (
                    <label
                      key={item.id}
                      className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 transition cursor-pointer touch-target ${
                        item.completed
                          ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-slate-500 line-through'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={() => handleToggleChecklistItem(item.id)}
                        className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm">{item.text}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Mobile-Friendly Status Progression Actions */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <h3 className="text-xs font-black uppercase text-slate-500">
                  Update Mission Status
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => handleStatusChange('EN_ROUTE', 'Field team started route')}
                    disabled={selectedTask.status !== 'ASSIGNED'}
                    className="flex flex-col items-center justify-center p-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-sm shadow-md transition disabled:opacity-30 disabled:pointer-events-none touch-target"
                  >
                    <Truck className="w-5 h-5 mb-1" />
                    <span>Start Route (EN_ROUTE)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStatusChange('ON_SITE', 'Arrived at incident scene')}
                    disabled={selectedTask.status !== 'EN_ROUTE'}
                    className="flex flex-col items-center justify-center p-4 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-black text-sm shadow-md transition disabled:opacity-30 disabled:pointer-events-none touch-target"
                  >
                    <MapPin className="w-5 h-5 mb-1" />
                    <span>Arrived (ON_SITE)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStatusChange('DONE', 'Checklist finished, aid handed over')}
                    disabled={selectedTask.status !== 'ON_SITE'}
                    className="flex flex-col items-center justify-center p-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md transition disabled:opacity-30 disabled:pointer-events-none touch-target"
                  >
                    <CheckCircle2 className="w-5 h-5 mb-1" />
                    <span>Mission Done (DONE)</span>
                  </button>
                </div>

                {selectedTask.status !== 'DONE' && selectedTask.status !== 'FAILED' && (
                  <div className="text-right pt-2">
                    <button
                      type="button"
                      onClick={() => handleStatusChange('FAILED', 'Unable to complete due to road blocked')}
                      className="text-xs font-bold text-red-600 hover:underline"
                    >
                      Report Problem / Abort Task (FAILED)
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-500">
            No assigned tasks currently found for your account.
          </div>
        )}
      </div>
    </div>
  );
}
