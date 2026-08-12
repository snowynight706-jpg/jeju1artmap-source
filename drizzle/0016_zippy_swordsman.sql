ALTER TABLE `place_directory` ADD `additional_categories_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `place_directory` ADD `location_group_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `place_directory` ADD `map_anchor_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `place_directory` ADD `featured_role` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `place_directory` ADD `aliases_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE `place_directory`
SET `location_group_id` = 'jeju-art-platform-building',
    `map_anchor_id` = 'jeju-art-platform',
    `additional_categories_json` = CASE
      WHEN `name` = '제주아트플랫폼' THEN '["exhibition-performance","multi-cultural","event-rental"]'
      ELSE '["exhibition-performance","event-rental"]'
    END
WHERE `name` IN ('제주아트플랫폼', '아르코공연연습센터@제주');--> statement-breakpoint
UPDATE `place_directory`
SET `featured_role` = 'workation-main-hub',
    `additional_categories_json` = '["creative-startup","event-rental","experience-education"]',
    `aliases_json` = '["제주소통협력센터","제주소통협력센터 메인 오피스","제주특별자치도 소통협력센터"]'
WHERE `name` IN ('제주시소통협력센터', '제주특별자치도 소통협력센터');--> statement-breakpoint
INSERT OR IGNORE INTO `place_directory`
  (`id`, `name`, `category`, `area`, `address`, `subtype`, `priority`, `description`, `operating_info`,
   `notes`, `source_url`, `map_url`, `checked_at`, `additional_categories_json`, `location_group_id`,
   `map_anchor_id`, `featured_role`, `aliases_json`, `updated_at`, `updated_by`)
VALUES
  ('master-v12-jeju-artist-welfare-center', '제주예술인복지센터', 'culture', '관덕로·목관아',
   '제주특별자치도 제주시 중앙로14길 18 제주아트플랫폼 1층', '예술인 복지·회의공간', '검토',
   '예술인의 행정 상담과 회의·세미나·교육 등 활동을 지원하는 공간',
   '운영·상담·대관 일정은 제주문화예술재단 공식 안내 확인',
   '제주아트플랫폼 건물 내 시설 · 공개 운영정보는 공식 공지 기준 확인',
   'https://www.jfac.kr/notification/notice/20301', '', '2026-08-12', '["creative-startup","event-rental","experience-education"]',
   'jeju-art-platform-building', 'jeju-art-platform', '', '["예술인복지센터","제주 예술인 복지센터"]',
   '2026-08-12T00:00:00.000Z', 'source:first-public-explorer-patch');
