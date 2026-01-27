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
    if (router.currentRoute.value.path !== '/login') return
    if (role === 'superadmin') router.replace('/super')
    else if (role === 'admin') router.replace('/admin')
  },
  { immediate: true }
)

const submit = async () => {
  try {
    loading.value = true
    await auth.signIn(email.value, password.value)
    await auth.init()

    const role = auth.profile?.role
    if (role === 'superadmin') await router.push('/super')
    else if (role === 'admin') await router.push('/admin')
    else ElMessage.warning('У этого пользователя нет доступа')
  } catch (err) {
    if (err instanceof FirebaseError) {
      ElMessage.error(`Ошибка входа: ${err.message}`)
    } else {
      ElMessage.error('Неизвестная ошибка при входе')
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-container">
    <div class="login-content">
      <div class="login-card">
        <div class="login-header">
          <div class="brand">
            <div class="logo-circle">
              <img src="../assets/img/checklist-logo.png" alt="">
            </div>
            <div class="brand-text">
              <div class="brand-name">Checklist Admin</div>
              <div class="brand-sub">Панель управления</div>
            </div>
          </div>


        </div>

        <el-form @submit.prevent="submit" class="login-form">
          <el-form-item>
              <span class="form-label">Логин</span>
            <el-input
              v-model="email"
              autocomplete="username"
              size="large"
              placeholder="example@email.com"
              :prefix-icon="'User'"
            />
          </el-form-item>

          <el-form-item>
              <span class="form-label">Пароль</span>
            <el-input
              v-model="password"
              type="password"
              show-password
              autocomplete="current-password"
              size="large"
              placeholder="Введите пароль"
              :prefix-icon="'Lock'"
            />
          </el-form-item>

          <el-button
            type="primary"
            :loading="loading"
            @click="submit"
            size="large"
            class="login-button"
          >
            <span v-if="!loading">Войти</span>
            <span v-else>Вход...</span>
          </el-button>
        </el-form>
      </div>
    </div>
  </div>
</template>

<style scoped>

.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
}

.login-content {
  width: 100%;
  max-width: 440px;
}

.login-card {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  border-radius: 25px;
  padding: 32px 40px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}

.login-header {
  text-align: center;
  margin-bottom: 22px;
}

.brand {
  display: flex;
  align-items: center;
  justify-content: start;
  margin-bottom: 14px;
}

.brand-text {
  text-align: left;
  line-height: 1.1;
}

.brand-name {
  font-weight: 800;
  font-size: 18px;
  color: #1a1a1a;
}

.brand-sub {
  font-size: 12px;
  color: #666666;
  margin-top: 4px;
}

.logo-circle {
  width: 54px;
  height: 54px;
  margin-right: 12px;
  background: rgba(0, 0, 0, 0.05);
  backdrop-filter: blur(8px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-circle img {
  width: 44px;
  height: 44px;
}

.login-title {
  font-size: 28px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 8px 0;
}

.login-subtitle {
  font-size: 15px;
  color: #666666;
  margin: 0;
  font-weight: 400;
}

.login-form {
  margin-top: 18px;
}

.form-label {
  font-size: 14px;
  font-weight: 500;
  color: #333333;
}

:deep(.el-form-item) {
  margin-bottom: 14px;
}

:deep(.el-form-item__label) {
  padding: 0;
  margin-bottom: 8px;
}

:deep(.el-input__wrapper) {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.3s ease;
}

:deep(.el-input__wrapper:hover) {
  border-color: rgba(0, 0, 0, 0.2);
}

:deep(.el-input__wrapper.is-focus) {
  border-color: rgba(0, 0, 0, 0.3);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.login-button {
  width: 100%;
  height: 44px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 500;
  margin-top: 8px;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(8px);
  border: none;
  color: #ffffff;
  transition: all 0.3s ease;
}

.login-button:hover {
  background: rgba(0, 0, 0, 1);
  transform: translateY(-1px);
}

.login-button:active {
  transform: translateY(0);
}

@media (max-width: 768px) {
  .login-card {
    padding: 40px 32px;
  }

  .login-title {
    font-size: 24px;
  }

  .logo-circle {
    width: 56px;
    height: 56px;
  }


}

@media (max-width: 480px) {
  .login-container {
    padding: 0 12px;
  }

  .login-card {
    padding: 32px 24px;
    border-radius: 25px;
  }

  .login-header {
    margin-bottom: 12px;
  }

  .logo-circle {
    width: 56px;
    height: 56px;
  }



  .login-title {
    font-size: 22px;
  }

  .login-subtitle {
    font-size: 14px;
  }

  .login-button {
    height: 44px;
    font-size: 15px;
  }
}

@media (max-width: 360px) {
  .login-card {
    padding: 28px 20px;
  }

  .login-title {
    font-size: 20px;
  }
}
</style>