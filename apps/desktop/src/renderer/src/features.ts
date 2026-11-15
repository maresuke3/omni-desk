import type { FeatureModule } from '@omni-desk/contracts/feature'
import { calendarFeature } from '@omni-desk/feature-calendar'
import { conversationsFeature } from '@omni-desk/feature-conversations'
import { homeFeature } from '@omni-desk/feature-home'
import { inboxFeature } from '@omni-desk/feature-inbox'
import { knowledgeFeature } from '@omni-desk/feature-knowledge'
import { mailFeature } from '@omni-desk/feature-mail'
import { settingsFeature } from '@omni-desk/feature-settings'
import { tasksFeature } from '@omni-desk/feature-tasks'

/**
 * シェルに組み込む Feature（MFE）の一覧。
 * 画面を追加するときは feature パッケージを作り、ここに 1 行足すだけにする。
 */
export const features: FeatureModule[] = [
  homeFeature,
  inboxFeature,
  mailFeature,
  tasksFeature,
  calendarFeature,
  knowledgeFeature,
  conversationsFeature,
  settingsFeature
]
