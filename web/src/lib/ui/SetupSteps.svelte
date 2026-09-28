<script lang="ts">
  import { t } from './strings';
</script>

<section class="card rise flex flex-col gap-5 p-6">
  <div class="flex flex-col gap-1.5">
    <h2 class="rail">{t.today.setup.title}</h2>
    <p class="note">{t.today.setup.note}</p>
  </div>
  <ol class="setup-steps text-[0.9375rem]">
    <li><span>{t.today.setup.passwordStep}</span></li>
    <li><span>{t.today.setup.collectorStep}</span></li>
  </ol>
  <p><a href="/admin" class="btn btn-primary">{t.today.setup.openAdmin}</a></p>
</section>
