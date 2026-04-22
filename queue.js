/**
 * queue.js — Job Queue System with Retry Logic
 * In-memory queue with concurrency control and retry
 * Can be upgraded to Bull/Redis by swapping the backend
 */

const EventEmitter = require('events');

class JobQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    this.concurrency  = options.concurrency || 5;
    this.maxRetries   = options.maxRetries  || 3;
    this.retryDelay   = options.retryDelay  || 2000;
    this.jobDelay     = options.jobDelay    || 800;

    this.queue      = [];
    this.processing = 0;
    this.results    = [];
    this.errors     = [];
    this.stats      = { queued: 0, completed: 0, failed: 0, retried: 0 };
    this._running   = false;
    this._drainResolve = null;
  }

  /**
   * Add a job to the queue
   * @param {Function} fn - Async function to execute
   * @param {object} meta - Job metadata (url, etc)
   */
  add(fn, meta = {}) {
    const job = {
      id:       `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      fn,
      meta,
      retries:  0,
      status:   'queued',
      createdAt: new Date()
    };
    this.queue.push(job);
    this.stats.queued++;
    this._tick();
    return job.id;
  }

  /**
   * Add multiple jobs at once
   */
  addMany(items, fnFactory) {
    const ids = [];
    for (const item of items) {
      const id = this.add(() => fnFactory(item), { item });
      ids.push(id);
    }
    return ids;
  }

  /**
   * Process the queue and return when all jobs are done
   */
  drain() {
    if (this.queue.length === 0 && this.processing === 0) {
      return Promise.resolve({ results: this.results, errors: this.errors, stats: this.stats });
    }

    return new Promise((resolve) => {
      this._drainResolve = () => {
        resolve({ results: this.results, errors: this.errors, stats: this.stats });
      };
      this._tick();
    });
  }

  _tick() {
    while (this.processing < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift();
      this._processJob(job);
    }
  }

  async _processJob(job) {
    this.processing++;
    job.status = 'processing';
    job.startedAt = new Date();

    try {
      await this._delay(this.jobDelay);
      const result = await job.fn();

      job.status    = 'completed';
      job.completedAt = new Date();
      this.results.push({ jobId: job.id, meta: job.meta, result });
      this.stats.completed++;
      this.emit('job:complete', { job, result });
      console.log(`  ✅ [Queue] Job done: ${job.meta?.item || job.id} (${this.stats.completed}/${this.stats.queued})`);

    } catch (err) {
      if (job.retries < this.maxRetries) {
        job.retries++;
        this.stats.retried++;
        console.log(`  ♻️  [Queue] Retrying job (attempt ${job.retries}/${this.maxRetries}): ${job.meta?.item || job.id}`);
        await this._delay(this.retryDelay * job.retries);
        this.queue.unshift(job); // Put back at front
      } else {
        job.status = 'failed';
        job.error  = err.message;
        this.errors.push({ jobId: job.id, meta: job.meta, error: err.message });
        this.stats.failed++;
        this.emit('job:failed', { job, error: err });
        console.log(`  ❌ [Queue] Job failed after ${this.maxRetries} retries: ${job.meta?.item || job.id}`);
      }
    }

    this.processing--;
    this._tick();

    // Check if all done
    if (this.queue.length === 0 && this.processing === 0 && this._drainResolve) {
      this._drainResolve();
      this._drainResolve = null;
    }
  }

  _delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      processing:  this.processing
    };
  }

  reset() {
    this.queue      = [];
    this.results    = [];
    this.errors     = [];
    this.processing = 0;
    this.stats      = { queued: 0, completed: 0, failed: 0, retried: 0 };
    this._drainResolve = null;
  }
}

// ─── Bulk Import Job Runner ───────────────────────────────────
async function runBulkImport(urls, scraperFn, options = {}) {
  const queue = new JobQueue({
    concurrency: options.concurrency || 5,
    maxRetries:  options.maxRetries  || 3,
    jobDelay:    options.delay       || 800
  });

  console.log(`🚀 [Queue] Starting bulk import: ${urls.length} URLs`);

  queue.addMany(urls, (url) => scraperFn(url));

  const { results, errors, stats } = await queue.drain();

  console.log(`📊 [Queue] Done — Success: ${stats.completed}, Failed: ${stats.failed}, Retried: ${stats.retried}`);

  return {
    products: results.map(r => r.result?.product).filter(Boolean),
    errors,
    stats
  };
}

module.exports = { JobQueue, runBulkImport };
