const { setAdminRole } = require('./admin-role');

setAdminRole(process.argv[2], false)
  .then(result => console.log(`Rol isAdmin revocado para ${result.email}.`))
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
