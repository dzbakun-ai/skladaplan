/* =========================================================
   SKLADAPLAN — ОТПРАВКА ЗАДАЧ В БОТ
   ========================================================= */

(function () {
  'use strict';

  function getSupabase() {
    try { if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient; } catch (e) {}
    if (window.supabaseClient) return window.supabaseClient;
    return null;
  }

  function toast(msg, type) {
    if (typeof window.toast === 'function') window.toast(msg, type || 'success');
    else console.log('[Dispatch]', msg);
  }

  /* =========================================================
     ОТПРАВКА ОПТИМИЗАЦИИ ГРУЗЧИКУ
     ========================================================= */
  async function dispatchOptimization(optimizationId) {
    const client = getSupabase();
    if (!client) { toast('Supabase недоступен', 'error'); return false; }

    if (!confirm(`Отправить оптимизацию №${optimizationId} грузчику?\n\nОн получит первую задачу из списка, остальные — после подтверждения каждой.`)) {
      return false;
    }

    try {
      const operatorEmail = window.state?.user?.email || null;

      // Вызываем SQL-функцию
      const { data, error } = await client.rpc('sp_dispatch_optimization', {
        p_optimization_id: optimizationId,
        p_created_by_email: operatorEmail,
        p_created_by_chat_id: null,
        p_target_chat_ids: null  // null = всем активным
      });

      if (error) throw error;

      const dispatchId = data;

      // Триггерим отправку через Edge Function
      await client.functions.invoke('telegram-webhook', {
        body: { action: 'dispatch_now', dispatch_id: dispatchId }
      });

      toast(`✓ Отправлено грузчику. Он получит первую задачу.`);

      // Показываем в интерфейсе кнопку «Отменить»
      // (или обновляем статус в блоке оптимизации)
      return true;

    } catch (e) {
      console.error('[Dispatch] optimization error:', e);
      toast('Ошибка отправки: ' + (e.message || ''), 'error');
      return false;
    }
  }

  /* =========================================================
     ОТПРАВКА ЗАДАЧИ С РАСПИСАНИЕМ
     ========================================================= */
  async function dispatchTask(taskData) {
    const client = getSupabase();
    if (!client) return false;

    try {
      const {
        title,
        description,
        priority,
        due_time,
        scheduled_at,
        target_chat_ids
      } = taskData;

      const operatorEmail = window.state?.user?.email || null;

      // 1. Создаём dispatch
      const { data: dispatch, error } = await client
        .from('task_dispatch')
        .insert({
          kind: 'task',
          title,
          description: description || '',
          payload: { task: taskData },
          target_chat_ids: target_chat_ids || null,
          scheduled_at: scheduled_at || null,
          status: 'pending',
          created_by_email: operatorEmail
        })
        .select('*')
        .single();

      if (error) throw error;

      // 2. Создаём единственный шаг
      await client
        .from('task_steps')
        .insert({
          dispatch_id: dispatch.id,
          step_index: 0,
          step_data: {
            type: 'task',
            title,
            description: description || '',
            priority: priority || '',
            due_time: due_time || ''
          },
          status: 'pending'
        });

      // 3. Если scheduled_at не задан — отправляем сразу
      if (!scheduled_at) {
        await client.functions.invoke('telegram-webhook', {
          body: { action: 'dispatch_now', dispatch_id: dispatch.id }
        });
        toast('✓ Задача отправлена всем');
      } else {
        const dt = new Date(scheduled_at).toLocaleString('ru-RU');
        toast(`✓ Задача отправлена по расписанию: ${dt}`);
      }

      return true;

    } catch (e) {
      console.error('[Dispatch] task error:', e);
      toast('Ошибка: ' + (e.message || ''), 'error');
      return false;
    }
  }

  /* =========================================================
     ОТПРАВКА РАССЫЛКИ
     ========================================================= */
  async function dispatchBroadcast(text, scheduledAt) {
    const client = getSupabase();
    if (!client) return false;

    const { data, error } = await client
      .from('task_dispatch')
      .insert({
        kind: 'broadcast',
        title: 'Объявление',
        description: text.slice(0, 100),
        payload: { text },
        scheduled_at: scheduledAt || null,
        status: 'pending',
        created_by_email: window.state?.user?.email || null
      })
      .select('*')
      .single();

    if (error) {
      toast('Ошибка: ' + error.message, 'error');
      return false;
    }

    // Один шаг = одно сообщение
    await client
      .from('task_steps')
      .insert({
        dispatch_id: data.id,
        step_index: 0,
        step_data: { type: 'broadcast', text },
        status: 'pending'
      });

    if (!scheduledAt) {
      await client.functions.invoke('telegram-webhook', {
        body: { action: 'dispatch_now', dispatch_id: data.id }
      });
    }

    toast('✓ Рассылка создана');
    return true;
  }

  /* =========================================================
     ПУБЛИЧНЫЙ API
     ========================================================= */
  window.spDispatch = {
    optimization: dispatchOptimization,
    task: dispatchTask,
    broadcast: dispatchBroadcast,
    version: '1.0.0'
  };

  console.log('[Dispatch] Модуль инициализирован');
})();
