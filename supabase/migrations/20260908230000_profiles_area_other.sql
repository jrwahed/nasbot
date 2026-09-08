-- «غير كده» في المنطقة بقت بتفتح خانة إجبارية — النص بيتخزّن هنا.
-- area نفسها بتفضل 'other' علشان الفلاتر والمطابقة ما تتغيرش.
alter table profiles add column if not exists area_other text;
comment on column profiles.area_other is 'المنطقة بالنص لما area = other. بيكتبها العضو في الانضمام.';
