const XLSX = require("xlsx")
const { createClient } = require("@supabase/supabase-js")

const supabase = createClient(
 "https://eaenzjwecrrbhibrvgsb.supabase.co",
 "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZW56andlY3JyYmhpYnJ2Z3NiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQyNDk3OCwiZXhwIjoyMDg1MDAwOTc4fQ.fcJKM5NS31f3NezlQztUY8AFyZPktVvhlnYsSx7sbcE"
)

function normalize(name) {
 return name
  .toLowerCase()
  .replace("golf club", "")
  .replace("golf course", "")
  .replace(/[^a-z0-9]/g, "")
}

async function loadCourses() {

 let all = []
 let from = 0
 const page = 1000

 while (true) {

  const { data } = await supabase
   .from("courses")
   .select("id,name")
   .range(from, from + page - 1)

  if (!data || data.length === 0) break

  all = all.concat(data)
  from += page

 }

 return all
}

async function run() {

 console.log("Loading courses from Supabase...")

 const courses = await loadCourses()

 const courseMap = {}

 courses.forEach(c => {
  courseMap[normalize(c.name)] = c.id
 })

 console.log(`Loaded ${courses.length} courses`)

 const workbook = XLSX.readFile("./datasets/whs/england_ratings.xlsx")

 const sheet = workbook.Sheets[workbook.SheetNames[0]]

 const rows = XLSX.utils.sheet_to_json(sheet)

 const inserts = []

 for (const r of rows) {

  const courseName = normalize(r.Course)

  const course_id = courseMap[courseName]

  if (!course_id) continue

  inserts.push({
   course_id,
   tee_name: r.Tee,
   tee_color: r.Tee,
   gender: "Men",
   course_rating: r["Course Rating"],
   slope_rating: r.Slope,
   par: r.Par,
   source: "whs",
   is_verified: true
  })

 }

 console.log(`Prepared ${inserts.length} tee rows`)

 const batch = 500

 for (let i = 0; i < inserts.length; i += batch) {

  const chunk = inserts.slice(i, i + batch)

  await supabase.from("tees").insert(chunk)

  console.log(`Inserted ${i + chunk.length}`)

 }

 console.log("WHS import complete")

}

run()