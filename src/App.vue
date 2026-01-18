<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <RouterView />
</template>

<style>
html, body, #app { height: 100%; }
body { margin: 0; font-family: "Montserrat";}

.el-form-item,
.el-input,
.el-button,
.el-placeholder,
.el-table {
  font-family: 'Montserrat';
}

.el-input__inner::placeholder,
.el-textarea__inner::placeholder {
  font-family: 'Montserrat';
  font-weight: 400;
  color: #9ca3af; /* мягкий серый */
}

</style>