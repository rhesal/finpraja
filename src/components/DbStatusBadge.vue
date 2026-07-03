<script setup>
defineProps({
  status: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <!-- Loading state -->
  <div v-if="status.loading" class="status-badge bg-slate-800 text-slate-400">
    <span class="loading loading-dots loading-xs"></span>
    <span>Connecting…</span>
  </div>

  <!-- Connected -->
  <div v-else-if="status.connected" class="status-badge bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
    <span class="relative flex h-2 w-2">
      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
      <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
    </span>
    <span class="text-[10px] font-semibold tracking-wide">OFFLINE DB</span>
  </div>

  <!-- Error -->
  <div v-else class="status-badge bg-red-500/10 text-red-400 border border-red-500/20">
    <i class="fa-solid fa-triangle-exclamation text-[10px]"></i>
    <span class="text-[10px] font-semibold">DB ERROR</span>
  </div>
</template>
