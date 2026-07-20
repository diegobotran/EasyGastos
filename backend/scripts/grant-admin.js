const { setAdminRole } = require('./admin-role');

setAdminRole(process.argv[2], true)
  .then(result => console.log(`Rol isAdmin habilitado para ${result.email}.`))
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
