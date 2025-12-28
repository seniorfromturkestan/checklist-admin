<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'
import { FirebaseError } from 'firebase/app'

defineOptions({ name: 'LoginPage' })

const email = ref('')
const password = ref('')
const loading = ref(false)
const auth = useAuthStore()
const router = useRouter()

watch(
  () => auth.profile?.role,
  (role) => {
    if (role === 'admin' && router.currentRoute.value.path === '/login') {
      router.replace('/admin')
    }
  },
  { immediate: true }
)

const submit = async () => {
  try {
    loading.value = true
    await auth.login(email.value, password.value)
    // дожидаемся подгрузки профиля (users/{uid}), иначе гвард может вернуть на /login
    await auth.init()
    if (auth.profile?.role === 'admin') {
      await router.push('/admin')
    } else {
      ElMessage.warning('У этого пользователя нет роли admin')
    }
  } catch (err: unknown) {
    let msg = 'Произошла ошибка'
    if (err instanceof FirebaseError) msg = err.message
    else if (err instanceof Error) msg = err.message
    else msg = String(err)
    ElMessage.error(msg)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login">
    <el-card style="max-width:420px;margin:64px auto;">
      <h2>Вход (админ точки)</h2>
      <el-form @submit.prevent="submit">
        <el-form-item label="Email">
          <el-input v-model="email" autocomplete="username" />
        </el-form-item>
        <el-form-item label="Пароль">
          <el-input v-model="password" show-password autocomplete="current-password"/>
        </el-form-item>
        <el-button type="primary" :loading="loading" @click="submit">Войти</el-button>
      </el-form>
    </el-card>
  </div>
</template>
