-- اللوحة بتعرض «آخر تعديل» لكل حقل، بس مكانش في حاجة بتحدّث العمود.
-- نفس التريجر المستعمل في game_questions و settings.
drop trigger if exists t_profile_fields_updated on profile_fields;
create trigger t_profile_fields_updated
  before update on profile_fields
  for each row execute function set_updated_at();;
