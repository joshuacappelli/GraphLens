import Header from './components/Header';

function App() {
  return (
    <main className="h-screen flex flex-col font-[roboto] font-bold bg-[#f7f7f7] dark:bg-main-light text-white">
      <Header />
      <section className='flex flex-row flex-1 w-full overflow-hidden justify-center items-center' >
        Here you can write your content
      </section>
    </main>
  )
}

export default App
