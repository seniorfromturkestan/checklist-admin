<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <RouterView />
</template>

<style>
html, body, #app { height: 100%; }
body { margin: 0; font-family: "Montserrat";}

/* Element Plus: enforce Montserrat everywhere */
.el-form-item,
.el-input,
.el-button,
.el-table,
.el-select,
.el-dialog,
.el-drawer,
.el-tag,
.el-menu,
.el-dropdown,
.el-pagination {
  font-family: 'Montserrat', sans-serif;
}

.el-input__inner,
.el-textarea__inner,
.el-select__selected-item {
  font-family: 'Montserrat', sans-serif;
}

.el-input__inner::placeholder,
.el-textarea__inner::placeholder {
  font-family: 'Montserrat', sans-serif;
  font-weight: 400;
  color: #9ca3af;
}

</style>
