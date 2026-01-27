import { createRouter, createWebHistory } from 'vue-router'
import PageView from '@/pages/PageView.vue'

const routes = [
  {
    path: '/:name?',
    name: 'PageView',
    component: PageView
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
