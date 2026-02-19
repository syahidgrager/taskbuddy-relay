import { Contract } from 'trac-peer';

const VALID_TRANSITIONS = {
  open: ['claimed', 'cancelled'],
  claimed: ['in_progress', 'done', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  done: ['settled'],
  cancelled: [],
  settled: [],
};

class TaskMeshContract extends Contract {
  constructor(protocol, options = {}) {
    super(protocol, options);

    this.addSchema('taskCreate', {
      value: {
        $$strict: true,
        $$type: 'object',
        op: { type: 'string', min: 1, max: 64 },
        taskId: { type: 'string', min: 3, max: 64 },
        title: { type: 'string', min: 3, max: 160 },
        description: { type: 'string', min: 1, max: 4000, optional: true },
        reward: { type: 'string', min: 1, max: 64, optional: true },
        channel: { type: 'string', min: 1, max: 160, optional: true },
        ref: { type: 'string', min: 1, max: 256, optional: true },
        ts: { type: 'number', integer: true, optional: true },
      },
    });

    this.addSchema('taskClaim', {
      value: {
        $$strict: true,
        $$type: 'object',
        op: { type: 'string', min: 1, max: 64 },
        taskId: { type: 'string', min: 3, max: 64 },
        ts: { type: 'number', integer: true, optional: true },
      },
    });

    this.addSchema('taskStart', {
      value: {
        $$strict: true,
        $$type: 'object',
        op: { type: 'string', min: 1, max: 64 },
        taskId: { type: 'string', min: 3, max: 64 },
        ts: { type: 'number', integer: true, optional: true },
      },
    });

    this.addSchema('taskSubmit', {
      value: {
        $$strict: true,
        $$type: 'object',
        op: { type: 'string', min: 1, max: 64 },
        taskId: { type: 'string', min: 3, max: 64 },
        result: { type: 'string', min: 1, max: 8000 },
        ts: { type: 'number', integer: true, optional: true },
      },
    });

    this.addSchema('taskCancel', {
      value: {
        $$strict: true,
        $$type: 'object',
        op: { type: 'string', min: 1, max: 64 },
        taskId: { type: 'string', min: 3, max: 64 },
        reason: { type: 'string', min: 1, max: 1024, optional: true },
        ts: { type: 'number', integer: true, optional: true },
      },
    });

    this.addSchema('taskSettle', {
      value: {
        $$strict: true,
        $$type: 'object',
        op: { type: 'string', min: 1, max: 64 },
        taskId: { type: 'string', min: 3, max: 64 },
        amount: { type: 'string', min: 1, max: 64, optional: true },
        txRef: { type: 'string', min: 1, max: 256, optional: true },
        ts: { type: 'number', integer: true, optional: true },
      },
    });

    this.addSchema('taskCheckpoint', {
      value: {
        $$strict: true,
        $$type: 'object',
        op: { type: 'string', min: 1, max: 64 },
        taskId: { type: 'string', min: 3, max: 64 },
        note: { type: 'string', min: 1, max: 2000 },
        percent: { type: 'number', integer: true, min: 0, max: 100, optional: true },
        ts: { type: 'number', integer: true, optional: true },
      },
    });

    this.addSchema('taskHandoff', {
      value: {
        $$strict: true,
        $$type: 'object',
        op: { type: 'string', min: 1, max: 64 },
        taskId: { type: 'string', min: 3, max: 64 },
        nextAssignee: { type: 'string', min: 3, max: 128 },
        reason: { type: 'string', min: 1, max: 1200, optional: true },
        ts: { type: 'number', integer: true, optional: true },
      },
    });

    this.addSchema('readTask', {
      value: {
        $$strict: true,
        $$type: 'object',
        op: { type: 'string', min: 1, max: 64 },
        taskId: { type: 'string', min: 3, max: 64 },
      },
    });

    this.addSchema('listTasks', {
      value: {
        $$strict: true,
        $$type: 'object',
        op: { type: 'string', min: 1, max: 64 },
        limit: { type: 'number', integer: true, min: 1, max: 200, optional: true },
      },
    });

    this.addSchema('listTasksByStatus', {
      value: {
        $$strict: true,
        $$type: 'object',
        op: { type: 'string', min: 1, max: 64 },
        status: { type: 'string', min: 1, max: 64 },
        limit: { type: 'number', integer: true, min: 1, max: 200, optional: true },
      },
    });

    this.addFunction('readSnapshot');
    this.addFunction('readTimer');

    this.addSchema('feature_entry', {
      key: { type: 'string', min: 1, max: 256 },
      value: { type: 'any' },
    });

    const _this = this;
    this.addFeature('timer_feature', async function () {
      if (_this.check.validateSchema('feature_entry', _this.op) === false) return;
      if (_this.op.key === 'currentTime') {
        await _this.put('currentTime', _this.op.value);
      }
    });
  }

  _taskKey(taskId) {
    return `task/${taskId}`;
  }

  _normalizeTaskId(rawTaskId) {
    return String(rawTaskId || '').trim();
  }

  async _now() {
    const timerTime = await this.get('currentTime');
    if (typeof timerTime === 'number') return timerTime;
    const fromTx = Number.parseInt(String(this.value?.ts ?? ''), 10);
    return Number.isFinite(fromTx) ? fromTx : null;
  }

  async _readTask(taskId) {
    return await this.get(this._taskKey(taskId));
  }

  async _readTaskIndex() {
    const index = await this.get('task_index');
    return Array.isArray(index) ? index : [];
  }

  async _writeTask(taskId, task) {
    await this.put(this._taskKey(taskId), task);
    await this.put('task_last', task);
  }

  _canTransition(from, to) {
    if (!from || !to) return false;
    const next = VALID_TRANSITIONS[from] || [];
    return next.includes(to);
  }

  _isCreator(task) {
    return task?.createdBy && this.address && task.createdBy === this.address;
  }

  _isAssignee(task) {
    return task?.assignee && this.address && task.assignee === this.address;
  }

  async taskCreate() {
    const taskId = this._normalizeTaskId(this.value?.taskId);
    if (!taskId) return new Error('Missing taskId.');

    const existing = await this._readTask(taskId);
    if (existing !== null) return new Error(`Task already exists: ${taskId}`);
    if (!this.address) return new Error('Missing sender address.');

    const now = await this._now();
    const task = {
      taskId,
      title: String(this.value?.title || '').trim(),
      description: String(this.value?.description || '').trim(),
      reward: this.value?.reward ? String(this.value.reward).trim() : null,
      channel: this.value?.channel ? String(this.value.channel).trim() : null,
      ref: this.value?.ref ? String(this.value.ref).trim() : null,
      status: 'open',
      createdBy: this.address,
      createdAt: now,
      updatedAt: now,
      assignee: null,
      claimedAt: null,
      startedAt: null,
      submittedAt: null,
      cancelledAt: null,
      settledAt: null,
      result: null,
      cancelReason: null,
      settlement: null,
      checkpoints: [],
      handoffs: [],
    };

    const index = await this._readTaskIndex();
    if (index.includes(taskId) === false) index.push(taskId);

    await this._writeTask(taskId, task);
    await this.put('task_index', index);

    console.log('task_create ok', { taskId, createdBy: this.address });
  }

  async taskClaim() {
    const taskId = this._normalizeTaskId(this.value?.taskId);
    if (!taskId) return new Error('Missing taskId.');
    if (!this.address) return new Error('Missing sender address.');

    const task = await this._readTask(taskId);
    if (task === null) return new Error(`Task not found: ${taskId}`);
    if (task.status !== 'open') return new Error(`Task is not open: ${task.status}`);
    if (!this._canTransition(task.status, 'claimed')) return new Error('Invalid state transition.');

    const now = await this._now();
    task.status = 'claimed';
    task.assignee = this.address;
    task.claimedAt = now;
    task.updatedAt = now;

    await this._writeTask(taskId, task);
    console.log('task_claim ok', { taskId, assignee: this.address });
  }

  async taskStart() {
    const taskId = this._normalizeTaskId(this.value?.taskId);
    if (!taskId) return new Error('Missing taskId.');
    if (!this.address) return new Error('Missing sender address.');

    const task = await this._readTask(taskId);
    if (task === null) return new Error(`Task not found: ${taskId}`);
    if (!this._isAssignee(task)) return new Error('Only assignee can start the task.');
    if (task.status !== 'claimed') return new Error(`Task cannot be started from: ${task.status}`);
    if (!this._canTransition(task.status, 'in_progress'))
      return new Error('Invalid state transition.');

    const now = await this._now();
    task.status = 'in_progress';
    task.startedAt = task.startedAt ?? now;
    task.updatedAt = now;

    await this._writeTask(taskId, task);
    console.log('task_start ok', { taskId, assignee: this.address });
  }

  async taskSubmit() {
    const taskId = this._normalizeTaskId(this.value?.taskId);
    if (!taskId) return new Error('Missing taskId.');
    if (!this.address) return new Error('Missing sender address.');

    const task = await this._readTask(taskId);
    if (task === null) return new Error(`Task not found: ${taskId}`);
    if (!this._isAssignee(task)) return new Error('Only assignee can submit result.');
    if (task.status !== 'claimed' && task.status !== 'in_progress') {
      return new Error(`Task cannot be submitted from: ${task.status}`);
    }
    if (!this._canTransition(task.status, 'done')) return new Error('Invalid state transition.');

    const now = await this._now();
    task.status = 'done';
    task.result = String(this.value?.result || '');
    task.submittedAt = now;
    task.updatedAt = now;

    await this._writeTask(taskId, task);
    console.log('task_submit ok', { taskId, by: this.address });
  }

  async taskCancel() {
    const taskId = this._normalizeTaskId(this.value?.taskId);
    if (!taskId) return new Error('Missing taskId.');
    if (!this.address) return new Error('Missing sender address.');

    const task = await this._readTask(taskId);
    if (task === null) return new Error(`Task not found: ${taskId}`);
    if (task.status === 'done' || task.status === 'settled' || task.status === 'cancelled') {
      return new Error(`Task cannot be cancelled from: ${task.status}`);
    }
    if (!this._isCreator(task) && !this._isAssignee(task)) {
      return new Error('Only creator or assignee can cancel.');
    }
    if (!this._canTransition(task.status, 'cancelled')) return new Error('Invalid state transition.');

    const now = await this._now();
    task.status = 'cancelled';
    task.cancelReason = this.value?.reason ? String(this.value.reason).trim() : null;
    task.cancelledAt = now;
    task.updatedAt = now;

    await this._writeTask(taskId, task);
    console.log('task_cancel ok', { taskId, by: this.address });
  }

  async taskSettle() {
    const taskId = this._normalizeTaskId(this.value?.taskId);
    if (!taskId) return new Error('Missing taskId.');
    if (!this.address) return new Error('Missing sender address.');

    const task = await this._readTask(taskId);
    if (task === null) return new Error(`Task not found: ${taskId}`);
    if (!this._isCreator(task)) return new Error('Only creator can settle task.');
    if (task.status !== 'done') return new Error(`Task is not ready to settle: ${task.status}`);
    if (!this._canTransition(task.status, 'settled')) return new Error('Invalid state transition.');

    const now = await this._now();
    task.status = 'settled';
    task.settlement = {
      amount: this.value?.amount ? String(this.value.amount).trim() : null,
      txRef: this.value?.txRef ? String(this.value.txRef).trim() : null,
      by: this.address,
      at: now,
    };
    task.settledAt = now;
    task.updatedAt = now;

    await this._writeTask(taskId, task);
    console.log('task_settle ok', { taskId, by: this.address });
  }

  async taskCheckpoint() {
    const taskId = this._normalizeTaskId(this.value?.taskId);
    if (!taskId) return new Error('Missing taskId.');
    if (!this.address) return new Error('Missing sender address.');

    const task = await this._readTask(taskId);
    if (task === null) return new Error(`Task not found: ${taskId}`);
    if (!this._isAssignee(task)) return new Error('Only assignee can add checkpoint.');
    if (task.status !== 'claimed' && task.status !== 'in_progress') {
      return new Error(`Task cannot be checkpointed from: ${task.status}`);
    }

    const now = await this._now();
    const percentRaw = Number.parseInt(String(this.value?.percent ?? ''), 10);
    const percent = Number.isFinite(percentRaw) ? Math.max(0, Math.min(percentRaw, 100)) : null;
    if (!Array.isArray(task.checkpoints)) task.checkpoints = [];
    task.checkpoints.push({
      by: this.address,
      at: now,
      note: String(this.value?.note || '').trim(),
      percent,
    });
    if (task.status === 'claimed') task.status = 'in_progress';
    task.updatedAt = now;

    await this._writeTask(taskId, task);
    console.log('task_checkpoint ok', { taskId, by: this.address, percent });
  }

  async taskHandoff() {
    const taskId = this._normalizeTaskId(this.value?.taskId);
    if (!taskId) return new Error('Missing taskId.');
    if (!this.address) return new Error('Missing sender address.');

    const task = await this._readTask(taskId);
    if (task === null) return new Error(`Task not found: ${taskId}`);
    if (!this._isAssignee(task)) return new Error('Only current assignee can handoff.');
    if (task.status !== 'claimed' && task.status !== 'in_progress') {
      return new Error(`Task cannot be handed off from: ${task.status}`);
    }

    const nextAssignee = String(this.value?.nextAssignee || '').trim();
    if (!nextAssignee) return new Error('Missing nextAssignee.');
    if (nextAssignee === task.assignee) return new Error('nextAssignee must differ from current assignee.');

    const now = await this._now();
    if (!Array.isArray(task.handoffs)) task.handoffs = [];
    task.handoffs.push({
      from: task.assignee,
      to: nextAssignee,
      by: this.address,
      at: now,
      reason: this.value?.reason ? String(this.value.reason).trim() : null,
    });
    task.assignee = nextAssignee;
    task.status = 'claimed';
    task.updatedAt = now;

    await this._writeTask(taskId, task);
    console.log('task_handoff ok', { taskId, from: this.address, to: nextAssignee });
  }

  async readTask() {
    const taskId = this._normalizeTaskId(this.value?.taskId);
    if (!taskId) return new Error('Missing taskId.');

    const task = await this._readTask(taskId);
    console.log('read_task', { taskId, task });
  }

  async listTasks() {
    const index = await this._readTaskIndex();
    const requested = Number.parseInt(String(this.value?.limit ?? '20'), 10);
    const limit = Number.isFinite(requested) ? Math.max(1, Math.min(requested, 200)) : 20;
    const items = [];
    for (let i = index.length - 1; i >= 0 && items.length < limit; i -= 1) {
      const taskId = index[i];
      const task = await this._readTask(taskId);
      if (task !== null) items.push(task);
    }
    console.log('list_tasks', { total: index.length, limit, items });
  }

  async listTasksByStatus() {
    const status = String(this.value?.status || '').trim().toLowerCase();
    if (!status) return new Error('Missing status.');

    const index = await this._readTaskIndex();
    const requested = Number.parseInt(String(this.value?.limit ?? '20'), 10);
    const limit = Number.isFinite(requested) ? Math.max(1, Math.min(requested, 200)) : 20;
    const items = [];
    for (let i = index.length - 1; i >= 0 && items.length < limit; i -= 1) {
      const taskId = index[i];
      const task = await this._readTask(taskId);
      if (task !== null && String(task.status || '').toLowerCase() === status) {
        items.push(task);
      }
    }
    console.log('list_tasks_by_status', { status, total: items.length, limit, items });
  }

  async readSnapshot() {
    const currentTime = await this.get('currentTime');
    const taskIndex = await this._readTaskIndex();
    const taskLast = await this.get('task_last');
    console.log('task_snapshot', {
      taskCount: taskIndex.length,
      taskLast,
      currentTime,
    });
  }

  async readTimer() {
    const currentTime = await this.get('currentTime');
    console.log('currentTime:', currentTime);
  }
}

export default TaskMeshContract;
