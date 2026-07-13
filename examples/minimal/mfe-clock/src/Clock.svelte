<script lang="ts">
let { basePath }: { basePath: string } = $props();
let now = $state(new Date());

$effect(() => {
  const timer = setInterval(() => {
    now = new Date();
  }, 1000);
  return () => clearInterval(timer);
});
</script>

<div class="clock">
  <p>I am a federated Svelte MFE mounted at <code>{basePath}</code>.</p>
  <time>{now.toLocaleTimeString()}</time>
</div>

<style>
  .clock {
    padding: 1rem;
    border: 1px solid #ccc;
    border-radius: 8px;
  }
  time {
    font-variant-numeric: tabular-nums;
    font-size: 1.5rem;
  }
</style>
