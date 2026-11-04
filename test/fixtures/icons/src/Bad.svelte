<!-- An icon from every place outside the chosen set. -->
<script lang="ts">
  import { House } from "phosphor-svelte";
  import { IconHome } from "@tabler/icons-svelte";
  import Icon from "@iconify/svelte";
  import { FontAwesomeIcon } from "@fortawesome/svelte-fontawesome";
  import logo from "./logo.svg?raw";
  const star = '<svg viewBox="0 0 24 24"><path d="M12 2l3 7h7l-5 5 2 8-7-4-7 4 2-8-5-5h7z"/></svg>';
</script>

<House />
<IconHome />
<Icon icon="mdi:home" />
<FontAwesomeIcon />
<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18" /></svg>
{@html star}
{@html logo}
<span class="material-symbols-outlined">home</span>
<i class="fa-solid fa-house"></i>
<i class="bi bi-house"></i>
