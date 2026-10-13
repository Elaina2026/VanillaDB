import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  Plus,
  Play,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Calendar,
  Terminal,
  Archive,
  Zap,
  Radio,
  X,
  Share2
} from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { formatDate } from '../lib/utils.js';
import { useI18n } from '../hooks/useI18n.js';
import { ConfirmModal } from './ConfirmModal.js';
import type { ScheduledJobRecord, ScheduleTaskRecord, ScheduleTaskAction } from '@shared/index.js';

interface DatabaseSchedulesProps {
  databaseId: string;
  canAdmin: boolean;
}

export const DatabaseSchedules: React.FC<DatabaseSchedulesProps> = ({ databaseId, canAdmin }) => {
  const { t, language } = useI18n();
  const queryClient = useQueryClient();

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isCheatsheetOpen, setIsCheatsheetOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<ScheduledJobRecord | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduleTaskRecord | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [scheduleModalError, setScheduleModalError] = useState<string | null>(null);
  const [taskModalError, setTaskModalError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Schedule Modal Form States
  const [scheduleName, setScheduleName] = useState('');
  const [simpleMode, setSimpleMode] = useState(true);
  const [intervalDays, setIntervalDays] = useState<number | ''>(1);
  const [intervalHours, setIntervalHours] = useState<number | ''>(1);
  const [intervalMinutes, setIntervalMinutes] = useState<number | ''>(5);
  const [useDays, setUseDays] = useState(false);
  const [useHours, setUseHours] = useState(false);
  const [useMinutes, setUseMinutes] = useState(true);
  const [cronMinute, setCronMinute] = useState('5');
  const [cronHour, setCronHour] = useState('*');
  const [cronDom, setCronDom] = useState('*');
  const [cronMonth, setCronMonth] = useState('*');
  const [cronDow, setCronDow] = useState('*');
  const [onlyWhenOnline, setOnlyWhenOnline] = useState(true);
  const [scheduleEnabled, setScheduleEnabled] = useState(true);

  // Task Modal Form States
  const [taskAction, setTaskAction] = useState<ScheduleTaskAction>('send_command');
  const [taskPayload, setTaskPayload] = useState('');
  const [taskTimeOffset, setTaskTimeOffset] = useState<number | ''>(0);
  const [taskContinueOnFailure, setTaskContinueOnFailure] = useState(false);

  // Query Jobs with robust error handling and proper stale time
  const { data: jobs = [], isLoading, refetch } = useQuery<ScheduledJobRecord[]>({
    queryKey: ['dbJobs', databaseId],
    queryFn: async () => {
      try {
        const res = await apiRequest<any>(`/api/admin/databases/${databaseId}/jobs`);
        if (Array.isArray(res)) return res;
        if (res && Array.isArray(res.data)) return res.data;
        return [];
      } catch (err: any) {
        return [];
      }
    },
    refetchInterval: 30000,
    staleTime: 15000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const selectedJob = useMemo(() => {
    if (!selectedJobId) return null;
    return jobs.find((j) => j.id === selectedJobId) || null;
  }, [jobs, selectedJobId]);

  // Create or Update Schedule Mutation
  const saveScheduleMutation = useMutation({
    mutationFn: async () => {
      let minute = (cronMinute || '*').trim();
      let hour = (cronHour || '*').trim();
      let dom = (cronDom || '*').trim();
      let month = (cronMonth || '*').trim();
      let dow = (cronDow || '*').trim();

      if (simpleMode) {
        const numMinutes = typeof intervalMinutes === 'number' && intervalMinutes >= 1 ? intervalMinutes : 1;
        const numHours = typeof intervalHours === 'number' && intervalHours >= 1 ? intervalHours : 1;
        const numDays = typeof intervalDays === 'number' && intervalDays >= 1 ? intervalDays : 1;

        if (useMinutes && !useHours && !useDays) {
          minute = numMinutes > 1 ? `*/${numMinutes}` : '*';
          hour = '*';
          dom = '*';
          month = '*';
          dow = '*';
        } else if (useHours && !useDays) {
          minute = useMinutes ? (numMinutes > 1 ? `*/${numMinutes}` : '0') : '0';
          hour = numHours > 1 ? `*/${numHours}` : '*';
          dom = '*';
          month = '*';
          dow = '*';
        } else if (useDays) {
          minute = useMinutes ? (numMinutes > 1 ? `*/${numMinutes}` : '0') : '0';
          hour = useHours ? (numHours > 1 ? `*/${numHours}` : '0') : '0';
          dom = numDays > 1 ? `*/${numDays}` : '*';
          month = '*';
          dow = '*';
        } else {
          minute = '*/5';
          hour = '*';
          dom = '*';
          month = '*';
          dow = '*';
        }
      }

      const cronExpression = `${minute} ${hour} ${dom} ${month} ${dow}`;

      if (editingJob) {
        return apiRequest(`/api/admin/jobs/${editingJob.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: scheduleName.trim(),
            cron_expression: cronExpression,
            cron_minute: minute,
            cron_hour: hour,
            cron_day_month: dom,
            cron_month: month,
            cron_day_week: dow,
            only_when_online: onlyWhenOnline,
            enabled: scheduleEnabled,
          }),
        });
      }

      return apiRequest(`/api/admin/databases/${databaseId}/jobs`, {
        method: 'POST',
        body: JSON.stringify({
          name: scheduleName.trim(),
          cron_expression: cronExpression,
          cron_minute: minute,
          cron_hour: hour,
          cron_day_month: dom,
          cron_month: month,
          cron_day_week: dow,
          only_when_online: onlyWhenOnline,
          enabled: scheduleEnabled,
          tasks: [],
        }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['dbJobs', databaseId] });
      setIsScheduleModalOpen(false);
      setEditingJob(null);
      setScheduleModalError(null);
      const createdId = data?.id || data?.data?.id;
      if (createdId) {
        setSelectedJobId(createdId);
      }
      showToast(language === 'vi' ? 'Đã lưu lịch trình thành công' : 'Schedule saved successfully');
    },
    onError: (err: any) => {
      setScheduleModalError(err.message || (language === 'vi' ? 'Không thể lưu lịch trình' : 'Failed to save schedule'));
    },
  });

  // Delete Schedule Mutation
  const deleteScheduleMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/jobs/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dbJobs', databaseId] });
      setDeletingJobId(null);
      setSelectedJobId(null);
      showToast(language === 'vi' ? 'Đã xóa lịch trình' : 'Schedule deleted');
    },
    onError: (err: any) => {
      showToast(err.message || (language === 'vi' ? 'Xóa lịch trình thất bại' : 'Failed to delete schedule'), 'error');
    },
  });

  // Run Schedule Mutation
  const runScheduleMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest<{ success: boolean; error?: string }>(`/api/admin/jobs/${id}/run`, { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dbJobs', databaseId] });
      queryClient.invalidateQueries({ queryKey: ['dbBackups', databaseId] });
      showToast(language === 'vi' ? 'Đã kích hoạt chạy lịch trình' : 'Schedule execution triggered');
    },
    onError: (err: any) => {
      showToast(err.message || (language === 'vi' ? 'Chạy lịch trình thất bại' : 'Failed to run schedule'), 'error');
    },
  });

  // Save Task Mutation (Add or Edit)
  const saveTaskMutation = useMutation({
    mutationFn: async () => {
      if (!selectedJob) return;
      const timeOffsetVal = typeof taskTimeOffset === 'number' && taskTimeOffset >= 0 ? taskTimeOffset : 0;
      if (editingTask) {
        return apiRequest(`/api/admin/jobs/${selectedJob.id}/tasks/${editingTask.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            action: taskAction,
            payload: taskPayload,
            time_offset: timeOffsetVal,
            continue_on_failure: taskContinueOnFailure,
          }),
        });
      }
      return apiRequest(`/api/admin/jobs/${selectedJob.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          action: taskAction,
          payload: taskPayload,
          time_offset: timeOffsetVal,
          continue_on_failure: taskContinueOnFailure,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dbJobs', databaseId] });
      setIsTaskModalOpen(false);
      setEditingTask(null);
      setTaskModalError(null);
      showToast(language === 'vi' ? 'Đã lưu tác vụ thành công' : 'Task saved successfully');
    },
    onError: (err: any) => {
      setTaskModalError(err.message || (language === 'vi' ? 'Không thể lưu tác vụ' : 'Failed to save task'));
    },
  });

  // Delete Task Mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      if (!selectedJob) return;
      return apiRequest(`/api/admin/jobs/${selectedJob.id}/tasks/${taskId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dbJobs', databaseId] });
      setDeletingTaskId(null);
      showToast(language === 'vi' ? 'Đã xóa tác vụ' : 'Task deleted');
    },
    onError: (err: any) => {
      showToast(err.message || (language === 'vi' ? 'Xóa tác vụ thất bại' : 'Failed to delete task'), 'error');
    },
  });

  const openCreateScheduleModal = () => {
    setEditingJob(null);
    setScheduleName('');
    setScheduleModalError(null);
    setSimpleMode(true);
    setUseDays(false);
    setUseHours(false);
    setUseMinutes(true);
    setIntervalMinutes(5);
    setIntervalHours(1);
    setIntervalDays(1);
    setCronMinute('5');
    setCronHour('*');
    setCronDom('*');
    setCronMonth('*');
    setCronDow('*');
    setOnlyWhenOnline(true);
    setScheduleEnabled(true);
    setIsScheduleModalOpen(true);
  };

  const openEditScheduleModal = (job: ScheduledJobRecord) => {
    setEditingJob(job);
    setScheduleName(job.name);
    setScheduleModalError(null);
    setSimpleMode(false);
    const parts = (job.cron_expression || '* * * * *').split(/\s+/);
    setCronMinute(job.cron_minute || parts[0] || '*');
    setCronHour(job.cron_hour || parts[1] || '*');
    setCronDom(job.cron_day_month || parts[2] || '*');
    setCronMonth(job.cron_month || parts[3] || '*');
    setCronDow(job.cron_day_week || parts[4] || '*');
    setOnlyWhenOnline(job.only_when_online !== false);
    setScheduleEnabled(job.enabled !== false);
    setIsScheduleModalOpen(true);
  };

  const openCreateTaskModal = () => {
    setEditingTask(null);
    setTaskModalError(null);
    setTaskAction('send_command');
    setTaskPayload('');
    setTaskTimeOffset(0);
    setTaskContinueOnFailure(false);
    setIsTaskModalOpen(true);
  };

  const openEditTaskModal = (task: ScheduleTaskRecord) => {
    setEditingTask(task);
    setTaskModalError(null);
    setTaskAction(task.action);
    setTaskPayload(task.payload);
    setTaskTimeOffset(task.time_offset);
    setTaskContinueOnFailure(task.continue_on_failure);
    setIsTaskModalOpen(true);
  };

  const formatNextRunRemaining = (nextRunAt: number | null): string => {
    if (!nextRunAt) return '—';
    const now = Date.now();
    const diffMs = nextRunAt - now;
    if (diffMs <= 0) return language === 'vi' ? 'sắp chạy' : 'due now';

    const totalSec = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const formatScheduleDateTime = (timestamp: number | null): string => {
    if (!timestamp) return 'n/a';
    const date = new Date(timestamp);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[date.getMonth()];
    const day = date.getDate();
    let hours = date.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month} ${day}th at ${hours}:${minutes}${ampm}`;
  };

  // RENDER: DETAIL VIEW (Image 3)
  if (selectedJob) {
    const cronParts = (selectedJob.cron_expression || '* * * * *').split(/\s+/);
    const tasks = selectedJob.tasks || [];

    return (
      <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in duration-150">
        {/* Top Header Card */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  onClick={() => setSelectedJobId(null)}
                  className="p-1 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors mr-1 cursor-pointer"
                  title="Back to schedules"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h2 className="text-xl font-bold tracking-tight text-foreground truncate">{selectedJob.name}</h2>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded tracking-wider uppercase ${
                    selectedJob.enabled
                      ? 'bg-blue-600 text-white'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {selectedJob.enabled ? 'ACTIVE' : 'INACTIVE'}
                </span>
                {selectedJob.last_status === 'failed' && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 rounded font-semibold">
                    FAILED
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground pl-7 flex items-center gap-2 flex-wrap">
                <span>
                  Last run at: {selectedJob.last_run_at ? formatScheduleDateTime(selectedJob.last_run_at) : 'n/a'}
                </span>
                <span>|</span>
                <span>
                  Next run in: {selectedJob.next_run_at ? (
                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                      {formatNextRunRemaining(selectedJob.next_run_at)} ({formatScheduleDateTime(selectedJob.next_run_at)})
                    </span>
                  ) : 'n/a'}
                </span>
              </div>
            </div>

            {canAdmin && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => runScheduleMutation.mutate(selectedJob.id)}
                  disabled={runScheduleMutation.isPending}
                  className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 border border-border text-foreground rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Run all tasks immediately"
                >
                  <Play className="w-3.5 h-3.5 fill-current text-emerald-500" />
                  {runScheduleMutation.isPending ? 'Running...' : 'Run Now'}
                </button>
                <button
                  onClick={() => openEditScheduleModal(selectedJob)}
                  className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 border border-border text-foreground rounded-lg text-xs font-medium transition-colors cursor-pointer"
                >
                  Edit
                </button>
                <button
                  onClick={openCreateTaskModal}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Task
                </button>
              </div>
            )}
          </div>

          {/* 5 Cron Value Boxes */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
            <div className="bg-muted/40 dark:bg-muted/20 border border-border rounded-lg p-3">
              <span className="text-[11px] text-muted-foreground block font-medium">Minute</span>
              <span className="text-base font-bold font-mono text-foreground mt-0.5 block">
                {selectedJob.cron_minute || cronParts[0] || '*'}
              </span>
            </div>
            <div className="bg-muted/40 dark:bg-muted/20 border border-border rounded-lg p-3">
              <span className="text-[11px] text-muted-foreground block font-medium">Hour</span>
              <span className="text-base font-bold font-mono text-foreground mt-0.5 block">
                {selectedJob.cron_hour || cronParts[1] || '*'}
              </span>
            </div>
            <div className="bg-muted/40 dark:bg-muted/20 border border-border rounded-lg p-3">
              <span className="text-[11px] text-muted-foreground block font-medium">Day (Month)</span>
              <span className="text-base font-bold font-mono text-foreground mt-0.5 block">
                {selectedJob.cron_day_month || cronParts[2] || '*'}
              </span>
            </div>
            <div className="bg-muted/40 dark:bg-muted/20 border border-border rounded-lg p-3">
              <span className="text-[11px] text-muted-foreground block font-medium">Month</span>
              <span className="text-base font-bold font-mono text-foreground mt-0.5 block">
                {selectedJob.cron_month || cronParts[3] || '*'}
              </span>
            </div>
            <div className="bg-muted/40 dark:bg-muted/20 border border-border rounded-lg p-3">
              <span className="text-[11px] text-muted-foreground block font-medium">Day (Week)</span>
              <span className="text-base font-bold font-mono text-foreground mt-0.5 block">
                {selectedJob.cron_day_week || cronParts[4] || '*'}
              </span>
            </div>
          </div>
        </div>

        {/* Tasks Container */}
        <div className="space-y-3">
          {tasks.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-14 text-center space-y-2">
              <h3 className="text-base font-bold text-foreground">No tasks yet</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Add a task to this schedule to automate commands, database maintenance, or backups.
              </p>
              {canAdmin && (
                <div className="pt-2">
                  <button
                    onClick={openCreateTaskModal}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create Task
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {tasks.map((task, idx) => (
                <div
                  key={task.id}
                  className="bg-card border border-border hover:border-blue-500/50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors shadow-xs"
                >
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-muted/60 border border-border flex items-center justify-center text-xs font-mono font-bold text-muted-foreground shrink-0">
                      {idx + 1}
                    </span>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                          {task.action === 'send_command' && <Terminal className="w-3.5 h-3.5 text-blue-500" />}
                          {(task.action === 'run_maintenance' || task.action === 'send_power_action') && <Zap className="w-3.5 h-3.5 text-amber-500" />}
                          {task.action === 'create_backup' && <Archive className="w-3.5 h-3.5 text-emerald-500" />}
                          {task.action === 'trigger_webhook' && <Radio className="w-3.5 h-3.5 text-purple-500" />}
                          {task.action === 'export_data' && <Archive className="w-3.5 h-3.5 text-cyan-500" />}
                          {task.action === 'send_command' && 'Send command'}
                          {(task.action === 'run_maintenance' || task.action === 'send_power_action') && 'Run maintenance'}
                          {task.action === 'create_backup' && 'Create backup'}
                          {task.action === 'trigger_webhook' && 'Trigger webhook'}
                          {task.action === 'export_data' && 'Export data'}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground border border-border rounded font-mono">
                          +{task.time_offset}s offset
                        </span>
                        {task.continue_on_failure && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded font-medium">
                            Continue on Failure
                          </span>
                        )}
                      </div>
                      {task.action === 'send_command' && task.payload && (
                        <pre className="text-[11px] font-mono text-foreground truncate max-w-xl bg-muted/50 dark:bg-black/30 px-2.5 py-1 rounded border border-border/60">
                          {task.payload}
                        </pre>
                      )}
                      {(task.action === 'run_maintenance' || task.action === 'send_power_action') && (
                        <span className="text-[11px] text-muted-foreground font-mono block">
                          Maintenance: {task.payload || 'Checkpoint & Optimize'}
                        </span>
                      )}
                      {task.action === 'create_backup' && (
                        <span className="text-[11px] text-muted-foreground block">
                          Automated SQLite snapshot backup
                        </span>
                      )}
                      {task.action === 'trigger_webhook' && (
                        <span className="text-[11px] text-muted-foreground font-mono block">
                          Webhook: {task.payload || 'Maintenance notification event'}
                        </span>
                      )}
                      {task.action === 'export_data' && (
                        <span className="text-[11px] text-muted-foreground block">
                          Auto database snapshot export
                        </span>
                      )}
                    </div>
                  </div>

                  {canAdmin && (
                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      <button
                        onClick={() => openEditTaskModal(task)}
                        className="p-1.5 hover:bg-accent text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
                        title="Edit task"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingTaskId(task.id)}
                        className="p-1.5 hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 rounded-lg transition-colors cursor-pointer"
                        title="Delete task"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Delete Schedule Button at Bottom Right */}
          {canAdmin && (
            <div className="flex justify-end pt-4">
              <button
                onClick={() => setDeletingJobId(selectedJob.id)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        {/* Delete Confirmation Modal for Task */}
        {deletingTaskId && (
          <ConfirmModal
            isOpen={true}
            title={language === 'vi' ? 'Xóa bước tác vụ' : 'Delete Task'}
            message={language === 'vi' ? 'Bạn có chắc chắn muốn xóa bước tác vụ này khỏi lịch trình?' : 'Are you sure you want to remove this task from the schedule?'}
            confirmText={language === 'vi' ? 'Xóa' : 'Delete'}
            variant="danger"
            onConfirm={() => deleteTaskMutation.mutate(deletingTaskId)}
            onClose={() => setDeletingTaskId(null)}
          />
        )}

        {/* Delete Confirmation Modal for Schedule */}
        {deletingJobId && (
          <ConfirmModal
            isOpen={true}
            title={language === 'vi' ? 'Xóa lịch trình' : 'Delete Schedule'}
            message={language === 'vi' ? 'Bạn có chắc chắn muốn xóa toàn bộ lịch trình này? Các tác vụ liên quan sẽ bị hủy bỏ.' : 'Are you sure you want to delete this schedule? All associated automated tasks will be cancelled.'}
            confirmText={language === 'vi' ? 'Xóa lịch' : 'Delete Schedule'}
            variant="danger"
            onConfirm={() => deleteScheduleMutation.mutate(deletingJobId)}
            onClose={() => setDeletingJobId(null)}
          />
        )}

        {/* Task Modal (Images 4 & 5) */}
        {isTaskModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 max-h-[90dvh] flex flex-col text-card-foreground">
              <div className="flex items-center justify-between pb-3 border-b border-border shrink-0">
                <h3 className="text-base font-bold text-foreground">
                  {editingTask ? 'Edit Task' : 'Create Task'}
                </h3>
                <button
                  onClick={() => setIsTaskModalOpen(false)}
                  className="p-1 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {taskModalError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-xs font-medium flex items-center justify-between shrink-0">
                  <span>{taskModalError}</span>
                  <button onClick={() => setTaskModalError(null)} className="text-red-400 hover:text-red-300">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="space-y-4 text-xs flex-1 overflow-y-auto pr-1">
                {/* Action & Time Offset Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">Action</label>
                    <select
                      value={taskAction}
                      onChange={(e) => {
                        const newAct = e.target.value as ScheduleTaskAction;
                        setTaskAction(newAct);
                        if (newAct === 'run_maintenance' || newAct === 'send_power_action') {
                          setTaskPayload('checkpoint');
                        } else if (newAct === 'create_backup' || newAct === 'export_data') {
                          setTaskPayload('');
                        }
                      }}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="send_command">Send command (Run SQL)</option>
                      <option value="run_maintenance">Run maintenance (WAL / VACUUM / Optimize / Reindex)</option>
                      <option value="create_backup">Create backup (Snapshot)</option>
                      <option value="trigger_webhook">Trigger webhook (Notification & Sync)</option>
                      <option value="export_data">Export data (Full backup)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">Time offset (in seconds)</label>
                    <input
                      type="number"
                      min={0}
                      value={taskTimeOffset}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          setTaskTimeOffset('');
                          return;
                        }
                        const n = parseInt(val, 10);
                        if (!isNaN(n)) {
                          setTaskTimeOffset(Math.max(0, n));
                        }
                      }}
                      onBlur={() => {
                        if (taskTimeOffset === '') setTaskTimeOffset(0);
                      }}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  The amount of time to wait after the previous task executes before running this one. If this is the first task on a schedule this will not be applied.
                </p>

                {/* Payload Field */}
                {taskAction === 'send_command' && (
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">Payload (SQL Statements)</label>
                    <textarea
                      rows={5}
                      value={taskPayload}
                      onChange={(e) => setTaskPayload(e.target.value)}
                      placeholder="e.g. DELETE FROM session_logs WHERE created_at < unixepoch() - 86400 * 30;"
                      className="w-full p-3 bg-background border border-border rounded-lg font-mono text-foreground text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>
                )}

                {(taskAction === 'run_maintenance' || taskAction === 'send_power_action') && (
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">Maintenance Routine</label>
                    <select
                      value={taskPayload || 'checkpoint'}
                      onChange={(e) => setTaskPayload(e.target.value)}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="checkpoint">WAL Checkpoint (TRUNCATE) & Optimize (Recommended)</option>
                      <option value="vacuum">Full Database VACUUM (Reclaim Disk Space)</option>
                      <option value="optimize">PRAGMA Optimize (Query Planner Statistics)</option>
                      <option value="reindex">REINDEX (Rebuild all B-Tree indexes)</option>
                    </select>
                  </div>
                )}

                {taskAction === 'create_backup' && (
                  <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-foreground text-xs space-y-1">
                    <p className="font-semibold flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                      <Archive className="w-4 h-4 text-emerald-500" />
                      Automatic Backup Task
                    </p>
                    <p className="text-muted-foreground">
                      Executing this task will generate an encrypted point-in-time SQLite snapshot backup and record it in the Backups panel.
                    </p>
                  </div>
                )}

                {taskAction === 'trigger_webhook' && (
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">Webhook Payload / Notification Note</label>
                    <input
                      type="text"
                      value={taskPayload}
                      onChange={(e) => setTaskPayload(e.target.value)}
                      placeholder="e.g. Daily cron completed successfully"
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-xs focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-[11px] text-muted-foreground mt-1 block">
                      Dispatches a real-time webhook event to all subscribed endpoints for this database.
                    </span>
                  </div>
                )}

                {taskAction === 'export_data' && (
                  <div className="p-3.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-foreground text-xs space-y-1">
                    <p className="font-semibold flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400">
                      <Archive className="w-4 h-4 text-cyan-500" />
                      Data Export Task
                    </p>
                    <p className="text-muted-foreground">
                      Saves a full automated snapshot export for offline disaster recovery or external archiving.
                    </p>
                  </div>
                )}

                {/* Continue on Failure Toggle */}
                <div className="pt-2">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={taskContinueOnFailure}
                      onClick={() => setTaskContinueOnFailure(!taskContinueOnFailure)}
                      className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none shrink-0 ${
                        taskContinueOnFailure ? 'bg-blue-600' : 'bg-muted-foreground/30'
                      }`}
                    >
                      <span
                        className={`block w-4 h-4 bg-white rounded-full transition-transform shadow-xs ${
                          taskContinueOnFailure ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className="text-xs font-semibold text-foreground">
                      {language === 'vi' ? 'Tiếp tục khi có lỗi' : 'Continue on Failure'}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {language === 'vi'
                      ? 'Các bước tác vụ tiếp theo vẫn sẽ được chạy kể cả khi bước này thất bại.'
                      : 'Future tasks will be run when this task fails.'}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border shrink-0">
                <button
                  onClick={() => setIsTaskModalOpen(false)}
                  className="px-4 py-2 border border-border hover:bg-accent rounded-lg text-muted-foreground text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={saveTaskMutation.isPending}
                  onClick={() => {
                    if (taskAction === 'send_command' && !taskPayload.trim()) {
                      setTaskModalError(language === 'vi' ? 'Vui lòng nhập câu lệnh SQL cho bước tác vụ này' : 'Please enter SQL statements for this task');
                      return;
                    }
                    saveTaskMutation.mutate();
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  {saveTaskMutation.isPending ? 'Saving...' : editingTask ? 'Save Changes' : 'Create Task'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Schedule Modal (Image 1) */}
        {isScheduleModalOpen && renderScheduleModal()}

        {/* Floating Toast Notification */}
        {toastMessage && (
          <div
            className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 ${
              toastMessage.type === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-emerald-600 text-white'
            }`}
          >
            <span>{toastMessage.text}</span>
            <button onClick={() => setToastMessage(null)} className="opacity-80 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  }

  // RENDER: LIST VIEW (Image 2)
  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-in fade-in duration-150">
      {/* Top Banner: Cron Cheatsheet Accordion & Create Schedule Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Cron Cheatsheet Dropdown */}
        <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden shadow-xs">
          <button
            onClick={() => setIsCheatsheetOpen(!isCheatsheetOpen)}
            className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            <span>Cron Cheatsheet</span>
            {isCheatsheetOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {isCheatsheetOpen && (
            <div className="px-4 pb-4 pt-1 text-xs border-t border-border bg-muted/30 space-y-2 text-muted-foreground font-mono">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                <div><span className="text-blue-500 font-bold">*</span> : any value</div>
                <div><span className="text-blue-500 font-bold">,</span> : list separator</div>
                <div><span className="text-blue-500 font-bold">-</span> : range of values</div>
                <div><span className="text-blue-500 font-bold">/</span> : step values</div>
              </div>
              <div className="pt-2 border-t border-border/50 text-[11px] grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <div><code className="text-foreground">*/5 * * * *</code> — Every 5 minutes</div>
                <div><code className="text-foreground">0 * * * *</code> — Every hour</div>
                <div><code className="text-foreground">0 0 * * *</code> — Daily at midnight</div>
                <div><code className="text-foreground">0 0 * * 0</code> — Weekly on Sunday</div>
              </div>
            </div>
          )}
        </div>

        {canAdmin && (
          <button
            onClick={openCreateScheduleModal}
            className="px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Create schedule
          </button>
        )}
      </div>

      {/* Schedules List */}
      <div className="space-y-3">
        {jobs.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-14 text-center space-y-2 shadow-xs">
            <h3 className="text-base font-bold text-foreground">No Schedules</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Automate routine SQL scripts, backup snapshots, or database maintenance routines.
            </p>
            {canAdmin && (
              <div className="pt-3">
                <button
                  onClick={openCreateScheduleModal}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create schedule
                </button>
              </div>
            )}
          </div>
        ) : (
          jobs.map((job) => {
            const cronParts = (job.cron_expression || '* * * * *').split(/\s+/);
            const remaining = formatNextRunRemaining(job.next_run_at);

            return (
              <div
                key={job.id}
                onClick={() => setSelectedJobId(job.id)}
                className="bg-card border border-border hover:border-blue-500/50 rounded-xl p-4.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all cursor-pointer shadow-xs group"
              >
                {/* Left: Icon & Title & Subtitle */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-muted/60 border border-border flex items-center justify-center shrink-0 text-muted-foreground group-hover:text-blue-500 group-hover:border-blue-500/40 transition-colors">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-foreground truncate group-hover:text-blue-500 transition-colors">
                      {job.name}
                    </h3>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <span>Last run: {job.last_run_at ? formatDate(job.last_run_at) : 'never'}</span>
                      <span>·</span>
                      <span>Next in <strong className="text-foreground font-semibold">{remaining}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Center: 5 Cron Columns with Labels */}
                <div className="flex items-center gap-5 sm:gap-7 font-mono text-center shrink-0 self-center">
                  <div>
                    <div className="text-xs font-bold text-foreground">
                      {job.cron_minute || cronParts[0] || '*'}
                    </div>
                    <div className="text-[9px] text-muted-foreground font-semibold tracking-wider">
                      MINUTE
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-foreground">
                      {job.cron_hour || cronParts[1] || '*'}
                    </div>
                    <div className="text-[9px] text-muted-foreground font-semibold tracking-wider">
                      HOUR
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-foreground">
                      {job.cron_day_month || cronParts[2] || '*'}
                    </div>
                    <div className="text-[9px] text-muted-foreground font-semibold tracking-wider">
                      DAY (MONTH)
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-foreground">
                      {job.cron_month || cronParts[3] || '*'}
                    </div>
                    <div className="text-[9px] text-muted-foreground font-semibold tracking-wider">
                      MONTH
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-foreground">
                      {job.cron_day_week || cronParts[4] || '*'}
                    </div>
                    <div className="text-[9px] text-muted-foreground font-semibold tracking-wider">
                      DAY (WEEK)
                    </div>
                  </div>
                </div>

                {/* Right: Status Badge */}
                <div className="shrink-0 self-end md:self-center">
                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded tracking-wider uppercase ${
                      job.enabled
                        ? 'bg-blue-600 text-white'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {job.enabled ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Schedule Modal (Image 1) */}
      {isScheduleModalOpen && renderScheduleModal()}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 ${
            toastMessage.type === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-emerald-600 text-white'
          }`}
        >
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="opacity-80 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );

  function renderScheduleModal() {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 max-h-[92dvh] flex flex-col text-card-foreground">
          <div className="flex items-center justify-between pb-3 border-b border-border shrink-0">
            <h3 className="text-base font-bold text-foreground">
              {editingJob ? (language === 'vi' ? 'Chỉnh sửa lịch trình' : 'Edit schedule') : (language === 'vi' ? 'Tạo lịch trình mới' : 'Create new schedule')}
            </h3>
            <button
              onClick={() => setIsScheduleModalOpen(false)}
              className="p-1 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {scheduleModalError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-xs font-medium flex items-center justify-between shrink-0">
              <span>{scheduleModalError}</span>
              <button onClick={() => setScheduleModalError(null)} className="text-red-400 hover:text-red-300">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="space-y-4 text-xs flex-1 overflow-y-auto pr-1">
            {/* Schedule Name */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                {language === 'vi' ? 'Tên lịch trình' : 'Schedule name'} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                maxLength={64}
                value={scheduleName}
                onChange={(e) => {
                  setScheduleName(e.target.value);
                  if (scheduleModalError) setScheduleModalError(null);
                }}
                placeholder={language === 'vi' ? 'VD: Sao lưu hàng ngày' : 'e.g. Daily maintenance'}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-blue-500 text-xs"
              />
              <span className="text-[11px] text-muted-foreground mt-1 block">
                {language === 'vi' ? 'Tên nhận diện cho lịch trình này (tối đa 64 ký tự).' : 'A human readable identifier for this schedule (max 64 chars).'}
              </span>
            </div>

            {/* Simple Interval Mode Toggle */}
            <div className="p-3 bg-muted/30 border border-border rounded-xl space-y-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={simpleMode}
                  onClick={() => setSimpleMode(!simpleMode)}
                  className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none shrink-0 ${
                    simpleMode ? 'bg-blue-600' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 bg-white rounded-full transition-transform shadow-xs ${
                      simpleMode ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <div>
                  <span className="text-xs font-bold text-foreground block">
                    {language === 'vi' ? 'Chế độ khoảng thời gian đơn giản' : 'Simple Interval Mode'}
                  </span>
                  <span className="text-[11px] text-muted-foreground block">
                    {language === 'vi'
                      ? 'Dùng bộ chọn chu kỳ đơn giản thay vì cú pháp cron.'
                      : 'Use a simplified interval picker instead of cron syntax.'}
                  </span>
                </div>
              </div>
            </div>

            {/* Simple Mode Options (Image 1) */}
            {simpleMode ? (
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between p-2.5 bg-muted/40 dark:bg-muted/20 border border-border rounded-lg">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground">
                    <input
                      type="checkbox"
                      checked={useDays}
                      onChange={(e) => setUseDays(e.target.checked)}
                      className="rounded border-border"
                    />
                    Days
                  </label>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Every</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={intervalDays}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          setIntervalDays('');
                          return;
                        }
                        const n = parseInt(val, 10);
                        if (!isNaN(n)) {
                          setIntervalDays(n);
                        }
                      }}
                      onBlur={() => {
                        if (intervalDays === '' || intervalDays < 1) setIntervalDays(1);
                        else if (intervalDays > 31) setIntervalDays(31);
                      }}
                      className="w-16 px-2 py-1 bg-background border border-border rounded text-center font-mono text-foreground"
                    />
                    <span>day(s)</span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 bg-muted/40 dark:bg-muted/20 border border-border rounded-lg">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground">
                    <input
                      type="checkbox"
                      checked={useHours}
                      onChange={(e) => setUseHours(e.target.checked)}
                      className="rounded border-border"
                    />
                    Hours
                  </label>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Every</span>
                    <input
                      type="number"
                      min={1}
                      max={23}
                      value={intervalHours}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          setIntervalHours('');
                          return;
                        }
                        const n = parseInt(val, 10);
                        if (!isNaN(n)) {
                          setIntervalHours(n);
                        }
                      }}
                      onBlur={() => {
                        if (intervalHours === '' || intervalHours < 1) setIntervalHours(1);
                        else if (intervalHours > 23) setIntervalHours(23);
                      }}
                      className="w-16 px-2 py-1 bg-background border border-border rounded text-center font-mono text-foreground"
                    />
                    <span>hour(s)</span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 bg-muted/40 dark:bg-muted/20 border border-border rounded-lg">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground">
                    <input
                      type="checkbox"
                      checked={useMinutes}
                      onChange={(e) => setUseMinutes(e.target.checked)}
                      className="rounded border-border"
                    />
                    Minutes
                  </label>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Every</span>
                    <input
                      type="number"
                      min={1}
                      max={59}
                      value={intervalMinutes}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          setIntervalMinutes('');
                          return;
                        }
                        const n = parseInt(val, 10);
                        if (!isNaN(n)) {
                          setIntervalMinutes(n);
                        }
                      }}
                      onBlur={() => {
                        if (intervalMinutes === '' || intervalMinutes < 1) setIntervalMinutes(1);
                        else if (intervalMinutes > 59) setIntervalMinutes(59);
                      }}
                      className="w-16 px-2 py-1 bg-background border border-border rounded text-center font-mono text-foreground"
                    />
                    <span>minute(s)</span>
                  </div>
                </div>

                <span className="text-[11px] text-muted-foreground block pt-1">
                  Enable the time units you want to use. At least one must be selected.
                </span>
              </div>
            ) : (
              /* Custom Cron 5 fields */
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Minute</label>
                  <input
                    type="text"
                    value={cronMinute}
                    onChange={(e) => setCronMinute(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-foreground font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Hour</label>
                  <input
                    type="text"
                    value={cronHour}
                    onChange={(e) => setCronHour(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-foreground font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Day (Month)</label>
                  <input
                    type="text"
                    value={cronDom}
                    onChange={(e) => setCronDom(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-foreground font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Month</label>
                  <input
                    type="text"
                    value={cronMonth}
                    onChange={(e) => setCronMonth(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-foreground font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Day (Week)</label>
                  <input
                    type="text"
                    value={cronDow}
                    onChange={(e) => setCronDow(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-foreground font-mono text-xs"
                  />
                </div>
              </div>
            )}

            {/* Only When Database Is Online Toggle */}
            <div className="pt-2 border-t border-border">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={onlyWhenOnline}
                  onClick={() => setOnlyWhenOnline(!onlyWhenOnline)}
                  className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none shrink-0 ${
                    onlyWhenOnline ? 'bg-blue-600' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 bg-white rounded-full transition-transform shadow-xs ${
                      onlyWhenOnline ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <div>
                  <span className="text-xs font-bold text-foreground block">
                    {language === 'vi' ? 'Chỉ chạy khi CSDL & Node hoạt động' : 'Only When Database & Node Are Online'}
                  </span>
                  <span className="text-[11px] text-muted-foreground block">
                    {language === 'vi'
                      ? 'Chỉ thực thi lịch trình này khi cơ sở dữ liệu và máy chủ lưu trữ ở trạng thái hoạt động bình thường.'
                      : 'Only execute this schedule when the database and storage node are in an active, healthy state.'}
                  </span>
                </div>
              </div>
            </div>

            {/* Schedule Enabled Toggle */}
            <div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={scheduleEnabled}
                  onClick={() => setScheduleEnabled(!scheduleEnabled)}
                  className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none shrink-0 ${
                    scheduleEnabled ? 'bg-blue-600' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 bg-white rounded-full transition-transform shadow-xs ${
                      scheduleEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <div>
                  <span className="text-xs font-bold text-foreground block">
                    {language === 'vi' ? 'Bật lịch trình tự động' : 'Schedule Enabled'}
                  </span>
                  <span className="text-[11px] text-muted-foreground block">
                    {language === 'vi'
                      ? 'Lịch trình này sẽ tự động chạy theo chu kỳ nếu được bật.'
                      : 'This schedule will be executed automatically if enabled.'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border shrink-0">
            <button
              onClick={() => setIsScheduleModalOpen(false)}
              className="px-4 py-2 border border-border hover:bg-accent rounded-lg text-muted-foreground text-xs font-medium transition-colors"
            >
              {language === 'vi' ? 'Hủy' : 'Cancel'}
            </button>
            <button
              disabled={saveScheduleMutation.isPending}
              onClick={() => {
                if (!scheduleName.trim()) {
                  setScheduleModalError(language === 'vi' ? 'Vui lòng nhập tên lịch trình' : 'Please enter a schedule name');
                  return;
                }
                saveScheduleMutation.mutate();
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              {saveScheduleMutation.isPending
                ? (language === 'vi' ? 'Đang lưu...' : 'Saving...')
                : editingJob
                ? (language === 'vi' ? 'Lưu thay đổi' : 'Save Changes')
                : (language === 'vi' ? 'Tạo lịch trình' : 'Create schedule')}
            </button>
          </div>
        </div>
      </div>
    );
  }
};
