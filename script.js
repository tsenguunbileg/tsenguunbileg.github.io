const input = document.getElementById("search-input");
const button = document.getElementById("search-button");
const pokemonID = document.getElementById("pokemon-id");
const pokemonName = document.getElementById("pokemon-name");
const spriteContainer = document.getElementById("sprite-container");
const types = document.getElementById("types");
const pokemonHeight = document.getElementById("height");
const pokemonWeight = document.getElementById("weight");
const hp = document.getElementById("hp");
const attack = document.getElementById("attack");
const defense = document.getElementById("defense");
const specialAttack = document.getElementById("special-attack");
const specialDefense = document.getElementById("special-defense");
const speed = document.getElementById("speed");

const output = document.getElementById("top-container");

const apiURL = "https://api.ebarimt.mn/api/info/check/getTinInfo?regNo=";

const getPokemon = async () => {
  try {
    const pokemonNameOrId = input.value.toUpperCase();
    const response = await fetch(`${apiURL}${pokemonNameOrId}`);
    const data = await response.json();
    const {
      data: tin
     /*  name,
      id,
      weight,
      height,
      sprites: { front_default: frontSprite },
      stats: [
        { base_stat: hpStat },
        { base_stat: attackStat },
        { base_stat: defenseStat },
        { base_stat: specialAttackStat },
        { base_stat: specialDefenseStat },
        { base_stat: speedStat },
      ], */
    } = data;
    //const typeNames = data.types.map(({ type: { name } }) => name);

    const response2 = await fetch(`https://api.ebarimt.mn/api/info/check/getInfo?tin=${tin}`);
    const data2 = await response2.json();
    const {
      data: {
        name,
        cityPayer,
        vatPayer,
        found,
        vatpayerRegisteredDate
      }
    } = data2;
console.log(name);

    pokemonName.textContent = "Нэр: " + name.toUpperCase();
  //  pokemonID.textContent = "ТИН нууцлалын дугаар: #" + tin;
    pokemonWeight.textContent = "ТИН нууцлалын дугаар: #" + tin;
    hp.textContent = `${vatPayer ? "Тийм" : "Үгүй"}`;
    attack.textContent = `${cityPayer ? "Тийм" : "Үгүй"}`;
    defense.textContent =`${found ? "Тийм" : "Үгүй"}`;
    specialAttack.textContent = `${vatpayerRegisteredDate ? vatpayerRegisteredDate : "Байхгүй"}`;
  /*  defense.textContent = defenseStat;
    specialAttack.textContent = specialAttackStat;
    specialDefense.textContent = specialDefenseStat;
    speed.textContent = speedStat; 

    spriteContainer.innerHTML = `<img src="${frontSprite}" id="sprite" class="size-1/3">`;
    types.innerHTML = typeNames
      .map((type) => {
        return `<span class="type ${type} bg-${type==='electric' ? 'cyan' : 'slate'}-200 p-1">${type}</span>`;
      })
      .join(""); */
  } catch (err) {
    console.log(err);
    //alert("Pokémon not found");
    pokemonName.textContent = "Тухайн хуулийн этгээд олдсонгүй";
  }
};

const clearUI = () => {
  pokemonName.textContent = "";
  pokemonID.textContent = "";
  pokemonWeight.textContent = "";
  pokemonHeight.textContent = "";
  hp.textContent = "";
  attack.textContent = "";
  defense.textContent = "";
  specialAttack.textContent = "";
};

button.addEventListener("click", (event) => {
  event.preventDefault();
  clearUI();
  getPokemon();
});

/*input.addEventListener("input", (event) => {
    clearUI();
    getPokemon();
  });*/

