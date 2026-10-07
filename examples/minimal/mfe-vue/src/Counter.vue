<script setup lang="ts">
import { ref } from "vue";

defineProps<{ basePath: string }>();
const count = ref(0);
</script>

<template>
  <div class="vue-card">
    <p>I am a federated Vue MFE mounted at <code>{{ basePath }}</code>.</p>
    <button type="button" @click="count++">Vue clicks: {{ count }}</button>
  </div>
</template>

<style scoped>
.vue-card {
  padding: 12px;
  border: 2px solid #42b883;
  border-radius: 8px;
}
</style>
